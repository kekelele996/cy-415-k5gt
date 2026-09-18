import { defineStore } from 'pinia';

import { walletApi } from '@/api/walletApi';
import type { PointAccount, PointEntry } from '@/models/point';

export const useWalletStore = defineStore('wallet', {
  state: () => ({
    accounts: [] as PointAccount[],
    entries: [] as PointEntry[],
    loaded: false,
  }),
  getters: {
    accountOf: (state) => (userId: string) =>
      state.accounts.find((account) => account.user_id === userId) ?? null,
    entriesOf: (state) => (userId: string) =>
      state.entries
        .filter((entry) => entry.user_id === userId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  },
  actions: {
    async hydrate() {
      this.accounts = await walletApi.accounts();
      this.entries = await walletApi.entries();
      this.loaded = true;
    },
    /** 结算事务提交后统一回读，保证页面与余额流水一致 */
    async refresh() {
      this.accounts = await walletApi.accounts();
      this.entries = await walletApi.entries();
    },
  },
});
