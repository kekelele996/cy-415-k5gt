import type { Router } from 'vue-router';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { LOG_MESSAGES } from '@/constants/messages';
import { useAuthStore } from '@/stores/authStore';
import { useDepositStore } from '@/stores/depositStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { usePointsStore } from '@/stores/pointsStore';

export const setupRouterGuards = (router: Router) => {
  router.beforeEach(async () => {
    const authStore = useAuthStore();
    const itemStore = useItemStore();
    const exchangeStore = useExchangeStore();
    const pointsStore = usePointsStore();
    const depositStore = useDepositStore();
    if (!authStore.currentUser) {
      await authStore.hydrate();
    }
    if (!itemStore.items.length) {
      await itemStore.hydrate();
    }
    if (!exchangeStore.exchanges.length) {
      await exchangeStore.hydrate();
    }
    if (!pointsStore.hydrated) {
      await pointsStore.hydrate();
    }
    if (!depositStore.settlements.length) {
      await depositStore.hydrate();
    }

    const statusProbe = itemStore.items.some((item) => item.status === ItemStatus.AVAILABLE);
    const exchangeProbe = exchangeStore.exchanges.some(
      (item) => item.status === ExchangeStatus.PENDING || item.status === ExchangeStatus.ACCEPTED,
    );
    if (import.meta.env.DEV && (statusProbe || exchangeProbe)) {
      console.debug(LOG_MESSAGES.storageHydrated);
    }
    return true;
  });
};
