import type { Router } from 'vue-router';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { LOG_MESSAGES } from '@/constants/messages';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useSettlementStore } from '@/stores/settlementStore';
import { useWalletStore } from '@/stores/walletStore';

export const setupRouterGuards = (router: Router) => {
  router.beforeEach(async () => {
    const authStore = useAuthStore();
    const itemStore = useItemStore();
    const exchangeStore = useExchangeStore();
    const walletStore = useWalletStore();
    const settlementStore = useSettlementStore();
    if (!authStore.currentUser) {
      await authStore.hydrate();
    }
    if (!itemStore.items.length) {
      await itemStore.hydrate();
    }
    if (!exchangeStore.exchanges.length) {
      await exchangeStore.hydrate();
    }
    // 钱包账户先于结算水合：结算种子需要在账户初始化事务里冻结诚信金
    if (!walletStore.loaded) {
      await walletStore.hydrate();
    }
    if (!settlementStore.settlements.length) {
      await settlementStore.hydrate();
      // 种子结算会同时写账户与流水，水合后回读一次，页面余额与流水对齐
      await walletStore.refresh();
    }

    const statusProbe = itemStore.items.some((item) => item.status === ItemStatus.AVAILABLE);
    const exchangeProbe = exchangeStore.exchanges.some((item) => item.status === ExchangeStatus.PENDING);
    if (import.meta.env.DEV && (statusProbe || exchangeProbe)) {
      console.debug(LOG_MESSAGES.storageHydrated);
    }
    return true;
  });
};
