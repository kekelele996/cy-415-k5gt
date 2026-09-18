import { defineStore } from 'pinia';

import { depositApi } from '@/api/depositApi';
import type { DepositSettlement } from '@/models/points';

export const useDepositStore = defineStore('deposits', {
  state: () => ({
    settlements: [] as DepositSettlement[],
  }),
  getters: {
    byExchange: (state) => (exchangeId: string) =>
      state.settlements.find((item) => item.exchange_id === exchangeId) ?? null,
  },
  actions: {
    async hydrate() {
      this.settlements = await depositApi.listSettlements();
    },
    async refresh() {
      await this.hydrate();
    },
  },
});
