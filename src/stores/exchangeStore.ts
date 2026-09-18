import { defineStore } from 'pinia';

import { depositApi } from '@/api/depositApi';
import { exchangeApi } from '@/api/exchangeApi';
import { DEPOSIT_AMOUNT, DepositStatus } from '@/constants/deposit';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { message } from '@/utils/message';
import { useAuthStore } from '@/stores/authStore';
import { useDepositStore } from '@/stores/depositStore';
import { useItemStore } from '@/stores/itemStore';
import { usePointsStore } from '@/stores/pointsStore';

type SettlementAction = 'accept' | 'complete' | 'cancel';

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
    /** 进行中的结算动作：同一交换同一动作在提交期间只允许一次，杜绝重复点击 */
    pendingSettlements: {} as Record<string, SettlementAction | undefined>,
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
    isSettling: (state) => (exchangeId: string) => Boolean(state.pendingSettlements[exchangeId]),
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
    async reject(id: string) {
      await exchangeApi.transition(id, ExchangeStatus.REJECTED);
      this.exchanges = await exchangeApi.list();
      message('已拒绝交换', 'success');
    },

    /** 同意交换 = 双方各冻结 20 点诚信金，余额不足整次拒绝 */
    async accept(id: string) {
      await this.runSettlement('accept', id, async () => {
        const result = await depositApi.freezeForAccept(id);
        message(`已同意交换，双方各冻结 ${DEPOSIT_AMOUNT} 点诚信金`, 'success');
        return result;
      });
    },

    /** 确认完成：双方都确认后原额解冻（第二个人点击时真正结算） */
    async complete(id: string) {
      await this.runSettlement('complete', id, async () => {
        const result = await depositApi.confirmComplete(id, this.operatorId(id));
        if (result.completed) {
          message('双方已确认完成，诚信金已原额解冻', 'success');
        } else {
          message('已记录你的完成确认，等待对方确认', 'success');
        }
        return result;
      });
    },

    /** 取消交换：取消方冻结份额转给对方，另一方自身份额原额解冻 */
    async cancel(id: string) {
      await this.runSettlement('cancel', id, async () => {
        const result = await depositApi.cancel(id, this.operatorId(id));
        if (result.settlement.status === DepositStatus.FORFEITED) {
          message(`已取消交换，你冻结的 ${DEPOSIT_AMOUNT} 点已赔付给对方`, 'success');
        }
        return result;
      });
    },

    operatorId(exchangeId: string): string {
      const authStore = useAuthStore();
      const currentId = authStore.currentUser?.id;
      if (!currentId) throw new Error('请先登录');
      return currentId;
    },

    /**
     * 结算动作统一入口：
     * 1. 同交换同动作进行中则直接忽略（重复点击/双击）；
     * 2. 事务内任一步失败 -> API 已整体回滚，这里只提示，不刷新出半成品；
     * 3. 成功后强制从存储层回读交换、物品、积分账户与流水。
     */
    async runSettlement(
      action: SettlementAction,
      id: string,
      task: () => Promise<{ completed?: boolean }>,
    ) {
      if (this.pendingSettlements[id]) return;
      this.pendingSettlements[id] = action;
      try {
        await task();
      } catch (error) {
        message(error instanceof Error ? error.message : '结算失败，已全部回滚', 'error');
        return;
      } finally {
        this.pendingSettlements[id] = undefined;
      }
      // 提交成功后统一回读，页面与余额流水一致
      const itemStore = useItemStore();
      const pointsStore = usePointsStore();
      const depositStore = useDepositStore();
      await Promise.all([
        this.hydrate(),
        itemStore.hydrate(),
        pointsStore.refresh(),
        depositStore.refresh(),
      ]);
    },
  },
});
