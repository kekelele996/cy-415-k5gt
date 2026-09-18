import { defineStore } from 'pinia';

import { settlementApi } from '@/api/settlementApi';
import type { ExchangeSettlement } from '@/models/settlement';

export const useSettlementStore = defineStore('settlements', {
  state: () => ({
    settlements: [] as ExchangeSettlement[],
    /** 进行中的结算操作 key：exchangeId:action，挡住同标签页重复点击 */
    pendingKeys: [] as string[],
  }),
  getters: {
    byExchange: (state) => (exchangeId: string) =>
      state.settlements.find((item) => item.exchange_id === exchangeId) ?? null,
  },
  actions: {
    async hydrate() {
      this.settlements = await settlementApi.list();
    },
    async refresh() {
      this.settlements = await settlementApi.list();
    },
    isPending(key: string) {
      return this.pendingKeys.includes(key);
    },
    markPending(key: string) {
      if (!this.pendingKeys.includes(key)) this.pendingKeys.push(key);
    },
    clearPending(key: string) {
      this.pendingKeys = this.pendingKeys.filter((item) => item !== key);
    },
  },
});
