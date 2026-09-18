import { defineStore } from 'pinia';

import { pointsApi } from '@/api/pointsApi';
import type { PointsAccount, PointsFlow } from '@/models/points';

export const usePointsStore = defineStore('points', {
  state: () => ({
    accounts: [] as PointsAccount[],
    flows: [] as PointsFlow[],
    hydrated: false,
  }),
  getters: {
    accountOf: (state) => (userId: string) =>
      state.accounts.find((account) => account.user_id === userId) ?? null,
    /** 积分流水始终按落账时间倒序，页面回读的是已持久化的权威数据 */
    flowsOf: (state) => (userId: string) =>
      state.flows
        .filter((flow) => flow.user_id === userId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  },
  actions: {
    async hydrate() {
      await pointsApi.bootstrap();
      const [accounts, flows] = await Promise.all([pointsApi.listAccounts(), pointsApi.listFlows()]);
      this.accounts = accounts;
      this.flows = flows;
      this.hydrated = true;
    },
    /** 结算事务提交后强制回读，保证页面余额/流水与持久化结果一致 */
    async refresh() {
      await this.hydrate();
    },
  },
});
