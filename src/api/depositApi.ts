import { pointsApi, type FlowInput } from '@/api/pointsApi';
import { DEPOSIT_AMOUNT, DepositStatus, PointsFlowType } from '@/constants/deposit';
import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import type { DepositSettlement } from '@/models/points';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import { STORAGE_KEYS, storage, type StorageTransaction } from '@/utils/storage';

/** 结算单 id 由交换 id 确定性派生：重复提交永远命中同一条，天然只结算一次 */
const settlementId = (exchangeId: string) => `deposit_${exchangeId}`;
const freezeKey = (exchangeId: string, userId: string) => `freeze:${exchangeId}:${userId}`;
const releaseKey = (exchangeId: string, userId: string) => `release:${exchangeId}:${userId}`;
const compensateKey = (exchangeId: string, receiverId: string) => `compensate:${exchangeId}:${receiverId}`;

const loadUsers = (tx: StorageTransaction) => tx.get(STORAGE_KEYS.users, []);
const loadItems = (tx: StorageTransaction) => tx.get<Item[]>(STORAGE_KEYS.items, []);
const loadExchanges = (tx: StorageTransaction) => tx.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
const loadSettlements = (tx: StorageTransaction) =>
  tx.get<DepositSettlement[]>(STORAGE_KEYS.depositSettlements, []);

const stageExchange = (
  tx: StorageTransaction,
  exchanges: Exchange[],
  exchangeId: string,
  patch: Partial<Exchange>,
): Exchange[] => {
  const nextExchange: Exchange = {
    ...exchanges.find((item) => item.id === exchangeId)!,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const next = exchanges.map((item) => (item.id === exchangeId ? nextExchange : item));
  tx.stage(STORAGE_KEYS.exchanges, next);
  return next;
};

const stageSettlement = (
  tx: StorageTransaction,
  settlements: DepositSettlement[],
  next: DepositSettlement,
): DepositSettlement[] => {
  const list = settlements.some((item) => item.id === next.id)
    ? settlements.map((item) => (item.id === next.id ? next : item))
    : [next, ...settlements];
  tx.stage(STORAGE_KEYS.depositSettlements, list);
  return list;
};

export interface DepositResult {
  exchange: Exchange;
  settlement: DepositSettlement;
  /** 双方确认完成时，第二次确认才真正解冻 */
  completed: boolean;
}

export const depositApi = {
  /**
   * 同意交换并冻结双方诚信金（单事务）：
   * - 交换必须处于 pending；
   * - 双方各冻结 20，可用余额不足任一方 -> 抛错，整笔不落盘（交换仍是待确认）；
   * - 冻结流水、结算单、交换 accepted 在同一事务一次提交。
   */
  freezeForAccept(exchangeId: string): Promise<DepositResult> {
    return storage.transaction(async (tx) => {
      const [users, exchanges] = await Promise.all([loadUsers(tx), loadExchanges(tx)]);
      const exchange = exchanges.find((item) => item.id === exchangeId);
      if (!exchange) throw new Error('交换请求不存在');

      // 已存在结算单：重复点击 / 刷新重放直接回显，绝不二次冻结。
      const existing = (await loadSettlements(tx)).find((item) => item.exchange_id === exchangeId);
      if (existing && existing.status === DepositStatus.HELD) {
        return { exchange, settlement: existing, completed: false };
      }

      if (exchange.status !== ExchangeStatus.PENDING) {
        throw new Error('当前交换状态不允许同意操作');
      }
      if (exchange.from_user_id === exchange.to_user_id) {
        throw new Error('不能与自己交换');
      }

      const accounts = await pointsApi.ensureSeedAccounts(tx, users);
      const fromAccount = accounts.find((item) => item.user_id === exchange.from_user_id);
      const toAccount = accounts.find((item) => item.user_id === exchange.to_user_id);
      if (!fromAccount || !toAccount) throw new Error('交换用户积分账户缺失，已全部回滚');
      if (fromAccount.available < DEPOSIT_AMOUNT || toAccount.available < DEPOSIT_AMOUNT) {
        // 余额不足：整次拒绝，不 stage 任何键，事务无写入。
        throw new Error(`双方需各有 ${DEPOSIT_AMOUNT} 点可用积分，余额不足，交换已整次拒绝`);
      }

      const timestamp = new Date().toISOString();
      const settlement: DepositSettlement = {
        id: settlementId(exchangeId),
        exchange_id: exchangeId,
        from_user_id: exchange.from_user_id,
        to_user_id: exchange.to_user_id,
        amount: DEPOSIT_AMOUNT,
        status: DepositStatus.HELD,
        confirmed_by: [],
        cancelled_by: null,
        freeze_flow_keys: [
          freezeKey(exchangeId, exchange.from_user_id),
          freezeKey(exchangeId, exchange.to_user_id),
        ],
        created_at: timestamp,
        updated_at: timestamp,
      };

      const freezes: FlowInput[] = [exchange.from_user_id, exchange.to_user_id].map((userId) => ({
        user_id: userId,
        exchange_id: exchangeId,
        type: PointsFlowType.FREEZE,
        available_delta: -DEPOSIT_AMOUNT,
        frozen_delta: DEPOSIT_AMOUNT,
        idempotency_key: freezeKey(exchangeId, userId),
        remark: `交换诚信金冻结 ${DEPOSIT_AMOUNT} 点`,
      }));
      for (const input of freezes) {
        // eslint-disable-next-line no-await-in-loop
        await pointsApi.applyFlow(tx, input);
      }

      const nextExchanges = stageExchange(tx, exchanges, exchangeId, {
        status: ExchangeStatus.ACCEPTED,
        deposit_settlement_id: settlement.id,
      });
      await stageSettlement(tx, await loadSettlements(tx), settlement);

      return {
        exchange: nextExchanges.find((item) => item.id === exchangeId)!,
        settlement,
        completed: false,
      };
    });
  },

  /**
   * 双方确认完成（单事务）：
   * - 任一方点击都登记确认（幂等），不立即解冻；
   * - 双方都确认后，各自原额解冻（各 +20 可用 / -20 冻结），
   *   结算单 released、交换 completed、双方物品 exchanged 同一次提交。
   */
  confirmComplete(exchangeId: string, operatorId: string): Promise<DepositResult> {
    return storage.transaction(async (tx) => {
      const exchanges = await loadExchanges(tx);
      const exchange = exchanges.find((item) => item.id === exchangeId);
      if (!exchange) throw new Error('交换请求不存在');

      const settlements = await loadSettlements(tx);
      const settlement = settlements.find((item) => item.exchange_id === exchangeId);

      // 已完成：重复确认（双击/重放）直接回显，不再解冻。
      if (
        exchange.status === ExchangeStatus.COMPLETED &&
        settlement?.status === DepositStatus.RELEASED
      ) {
        return { exchange, settlement, completed: true };
      }
      if (!settlement || settlement.status !== DepositStatus.HELD) {
        throw new Error('交换未冻结诚信金，无法确认完成');
      }
      if (![settlement.from_user_id, settlement.to_user_id].includes(operatorId)) {
        throw new Error('仅交换双方可以确认完成');
      }

      const confirmed = settlement.confirmed_by.includes(operatorId)
        ? settlement.confirmed_by
        : [...settlement.confirmed_by, operatorId];
      const bothConfirmed = confirmed.includes(settlement.from_user_id) && confirmed.includes(settlement.to_user_id);

      if (!bothConfirmed) {
        // 仅一方确认：只更新结算单确认进度，不动积分。
        const nextSettlement: DepositSettlement = {
          ...settlement,
          confirmed_by: confirmed,
          updated_at: new Date().toISOString(),
        };
        await stageSettlement(tx, settlements, nextSettlement);
        return { exchange, settlement: nextSettlement, completed: false };
      }

      for (const userId of [settlement.from_user_id, settlement.to_user_id]) {
        // eslint-disable-next-line no-await-in-loop
        await pointsApi.applyFlow(tx, {
          user_id: userId,
          exchange_id: exchangeId,
          type: PointsFlowType.RELEASE,
          available_delta: DEPOSIT_AMOUNT,
          frozen_delta: -DEPOSIT_AMOUNT,
          idempotency_key: releaseKey(exchangeId, userId),
          remark: `交换完成，诚信金原额解冻 ${DEPOSIT_AMOUNT} 点`,
        });
      }

      const released: DepositSettlement = {
        ...settlement,
        status: DepositStatus.RELEASED,
        confirmed_by: confirmed,
        updated_at: new Date().toISOString(),
      };

      // 双方物品标记已交换
      const items = await loadItems(tx);
      const exchangedItems = items.filter(
        (item) => item.id === exchange.from_item_id || item.id === exchange.to_item_id,
      );
      if (exchangedItems.length) {
        tx.stage(
          STORAGE_KEYS.items,
          items.map((item) =>
            item.id === exchange.from_item_id || item.id === exchange.to_item_id
              ? { ...item, status: ItemStatus.EXCHANGED }
              : item,
          ),
        );
      }

      const nextExchanges = stageExchange(tx, exchanges, exchangeId, {
        status: ExchangeStatus.COMPLETED,
      });
      await stageSettlement(tx, settlements, released);

      return {
        exchange: nextExchanges.find((item) => item.id === exchangeId)!,
        settlement: released,
        completed: true,
      };
    });
  },

  /**
   * 任一方取消（单事务）：
   * - 取消方冻结的 20 转给对方（对方可用 +20），取消方自身可用不回补；
   * - 另一方自己冻结的 20 原额解冻；
   * - 结算单 forfeited、交换 cancelled 同一次提交。
   */
  cancel(exchangeId: string, operatorId: string): Promise<DepositResult> {
    return storage.transaction(async (tx) => {
      const exchanges = await loadExchanges(tx);
      const exchange = exchanges.find((item) => item.id === exchangeId);
      if (!exchange) throw new Error('交换请求不存在');

      const settlements = await loadSettlements(tx);
      const settlement = settlements.find((item) => item.exchange_id === exchangeId);

      // 已取消：重复点击直接回显，不再赔付。
      if (
        exchange.status === ExchangeStatus.CANCELLED &&
        settlement?.status === DepositStatus.FORFEITED
      ) {
        return { exchange, settlement, completed: false };
      }
      if (!settlement || settlement.status !== DepositStatus.HELD) {
        throw new Error('交换未冻结诚信金，无法取消');
      }
      if (![settlement.from_user_id, settlement.to_user_id].includes(operatorId)) {
        throw new Error('仅交换双方可以取消交换');
      }

      const receiverId =
        operatorId === settlement.from_user_id ? settlement.to_user_id : settlement.from_user_id;

      // 对方：自身冻结 20 原额解冻 + 收到取消方 20 赔付（合并可用 +40、冻结 -20，两条流水）
      await pointsApi.applyFlow(tx, {
        user_id: receiverId,
        exchange_id: exchangeId,
        type: PointsFlowType.RELEASE,
        available_delta: DEPOSIT_AMOUNT,
        frozen_delta: -DEPOSIT_AMOUNT,
        idempotency_key: releaseKey(exchangeId, receiverId),
        remark: `交换取消，自身诚信金原额解冻 ${DEPOSIT_AMOUNT} 点`,
      });
      await pointsApi.applyFlow(tx, {
        user_id: receiverId,
        exchange_id: exchangeId,
        type: PointsFlowType.COMPENSATE,
        available_delta: DEPOSIT_AMOUNT,
        frozen_delta: 0,
        idempotency_key: compensateKey(exchangeId, receiverId),
        remark: `对方取消，收到诚信金赔付 ${DEPOSIT_AMOUNT} 点`,
      });
      // 取消方：冻结的 20 被划转给对方，自身可用不变（冻结 -20、可用 0）
      await pointsApi.applyFlow(tx, {
        user_id: operatorId,
        exchange_id: exchangeId,
        type: PointsFlowType.FORFEIT,
        available_delta: 0,
        frozen_delta: -DEPOSIT_AMOUNT,
        idempotency_key: `forfeit:${exchangeId}:${operatorId}`,
        remark: `取消交换，冻结的 ${DEPOSIT_AMOUNT} 点诚信金赔付给对方`,
      });

      const forfeited: DepositSettlement = {
        ...settlement,
        status: DepositStatus.FORFEITED,
        cancelled_by: operatorId,
        confirmed_by: settlement.confirmed_by,
        updated_at: new Date().toISOString(),
      };

      const nextExchanges = stageExchange(tx, exchanges, exchangeId, {
        status: ExchangeStatus.CANCELLED,
      });
      await stageSettlement(tx, settlements, forfeited);

      return {
        exchange: nextExchanges.find((item) => item.id === exchangeId)!,
        settlement: forfeited,
        completed: false,
      };
    });
  },

  async listSettlements(): Promise<DepositSettlement[]> {
    return storage.get<DepositSettlement[]>(STORAGE_KEYS.depositSettlements, []);
  },
};
