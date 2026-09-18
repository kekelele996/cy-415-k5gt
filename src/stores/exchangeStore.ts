import { defineStore } from 'pinia';

import { exchangeApi } from '@/api/exchangeApi';
import { settlementApi } from '@/api/settlementApi';
import { ExchangeStatus } from '@/constants/exchange';
import { SETTLEMENT_MESSAGES } from '@/constants/messages';
import { EARNEST_POINTS } from '@/constants/point';
import { SettlementStatus } from '@/constants/settlement';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { InsufficientPointsError } from '@/utils/ledger';
import { message } from '@/utils/message';

import { useAuthStore } from './authStore';
import { useItemStore } from './itemStore';
import { useSettlementStore } from './settlementStore';
import { useWalletStore } from './walletStore';

/** 结算成功后统一回读：交换、结算、积分、物品全部从存储重读，页面与流水一致 */
const syncAfterSettlement = async () => {
  const itemStore = useItemStore();
  const settlementStore = useSettlementStore();
  const walletStore = useWalletStore();
  await Promise.all([itemStore.hydrate(), settlementStore.refresh(), walletStore.refresh()]);
};

const runSettlement = async (key: string, task: () => Promise<unknown>, after: () => Promise<void>) => {
  const settlementStore = useSettlementStore();
  // 同一笔交换的同一操作进行中：直接吞掉重复点击
  if (settlementStore.isPending(key)) return;
  settlementStore.markPending(key);
  try {
    await task();
    await after();
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      message(SETTLEMENT_MESSAGES.insufficient(EARNEST_POINTS), 'error');
    } else {
      message(
        `${SETTLEMENT_MESSAGES.settleFailed}：${error instanceof Error ? error.message : '未知错误'}`,
        'error',
      );
    }
  } finally {
    settlementStore.clearPending(key);
  }
};

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.exchanges = await exchangeApi.list();
      } finally {
        this.loading = false;
      }
    },
    async create(draft: ExchangeDraft) {
      const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
      this.exchanges = await exchangeApi.list();
      message('交换请求已发出', 'success');
      return exchange;
    },
    /** 同意交换 = 创建诚信金结算：双方各冻结 20，余额不足或任一步失败整体拒绝 */
    async accept(id: string) {
      const authStore = useAuthStore();
      if (!authStore.currentUser) return;
      await runSettlement(
        `${id}:accept`,
        () => settlementApi.accept(id, authStore.currentUser!.id),
        async () => {
          this.exchanges = await exchangeApi.list();
          await syncAfterSettlement();
          message(SETTLEMENT_MESSAGES.accepted(EARNEST_POINTS), 'success');
        },
      );
    },
    async reject(id: string) {
      await exchangeApi.transition(id, ExchangeStatus.REJECTED);
      this.exchanges = await exchangeApi.list();
      message('已拒绝交换', 'success');
    },
    /** 一方确认完成；双方齐确认后原额解冻（settlementApi 同一事务内完成） */
    async complete(id: string) {
      const authStore = useAuthStore();
      if (!authStore.currentUser) return;
      const settlementStore = useSettlementStore();
      await runSettlement(
        `${id}:complete`,
        () => settlementApi.confirmComplete(id, authStore.currentUser!.id),
        async () => {
          this.exchanges = await exchangeApi.list();
          await syncAfterSettlement();
          const settlement = settlementStore.byExchange(id);
          if (settlement?.status === SettlementStatus.RELEASED) {
            message(SETTLEMENT_MESSAGES.released(EARNEST_POINTS), 'success');
          } else {
            message(SETTLEMENT_MESSAGES.confirmWaiting, 'success');
          }
        },
      );
    },
    /** 任一方取消：取消方冻结份额划转给对方，另一方可用积分不变 */
    async cancel(id: string) {
      const authStore = useAuthStore();
      if (!authStore.currentUser) return;
      await runSettlement(
        `${id}:cancel`,
        () => settlementApi.cancel(id, authStore.currentUser!.id),
        async () => {
          this.exchanges = await exchangeApi.list();
          await syncAfterSettlement();
          message(SETTLEMENT_MESSAGES.canceled(EARNEST_POINTS), 'success');
        },
      );
    },
  },
});
