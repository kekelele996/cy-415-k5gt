import { ExchangeStatus, EXCHANGE_ACTION_FLOW } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import {
  DEFAULT_POINT_BALANCE,
  EARNEST_POINTS,
  SEED_SETTLEMENT_EXCHANGE_ID,
  SETTLEMENT_LOCK_NAME,
} from '@/constants/point';
import { SettlementStatus } from '@/constants/settlement';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { PointAccount, PointEntry } from '@/models/point';
import type { ExchangeSettlement } from '@/models/settlement';

import { itemApi } from './itemApi';
import { userApi } from './userApi';
import {
  compensateForCancel,
  ensureAccount,
  freezeForExchange,
  releaseForCompletion,
} from '@/utils/ledger';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { withLock } from '@/utils/withLock';

const stamp = () => new Date().toISOString();

const findSettlement = (settlements: ExchangeSettlement[], exchangeId: string) =>
  settlements.find((item) => item.exchange_id === exchangeId);

const findExchangeOrThrow = (exchanges: Exchange[], id: string): Exchange => {
  const exchange = exchanges.find((item) => item.id === id);
  if (!exchange) throw new Error('交换请求不存在');
  return exchange;
};

const assertParty = (exchange: Exchange, userId: string) => {
  if (exchange.from_user_id !== userId && exchange.to_user_id !== userId) {
    throw new Error('只有交换双方可以操作诚信金结算');
  }
};

const seedAcceptedExchange = async (seededExchange: Exchange): Promise<ExchangeSettlement[]> => {
  const users = await userApi.list();
  const frozenSettlement: ExchangeSettlement = {
    id: storage.createId('settlement'),
    exchange_id: seededExchange.id,
    from_user_id: seededExchange.from_user_id,
    to_user_id: seededExchange.to_user_id,
    amount_per_side: EARNEST_POINTS,
    status: SettlementStatus.FROZEN,
    confirmed_by_from: false,
    confirmed_by_to: false,
    canceled_by: null,
    frozen_at: seededExchange.updated_at,
    settled_at: null,
    updated_at: stamp(),
  };

  return withLock(SETTLEMENT_LOCK_NAME, () =>
    storage.txn(async (ctx) => {
      // 进入锁后重新读取，避免两个 hydrate 调用并发时重复种子
      const settlements = await ctx.get<ExchangeSettlement[]>(STORAGE_KEYS.settlements, []);
      const existing = findSettlement(settlements, SEED_SETTLEMENT_EXCHANGE_ID);
      if (existing) return { snapshot: {}, result: settlements };

      const accounts = await ctx.get<PointAccount[]>(STORAGE_KEYS.pointAccounts, []);
      const entries = await ctx.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
      const baseAccounts = users.map((user) => ensureAccount(accounts, user.id, DEFAULT_POINT_BALANCE));
      const { accounts: nextAccounts, entries: freezeEntries } = freezeForExchange(
        baseAccounts,
        [seededExchange.from_user_id, seededExchange.to_user_id],
        seededExchange.id,
        DEFAULT_POINT_BALANCE,
      );
      const nextSettlements = [...settlements, frozenSettlement];
      return {
        snapshot: {
          [STORAGE_KEYS.pointAccounts]: nextAccounts,
          [STORAGE_KEYS.pointEntries]: [...entries, ...freezeEntries],
          [STORAGE_KEYS.settlements]: nextSettlements,
        },
        result: nextSettlements,
      };
    }),
  );
};

export const settlementApi = {
  /**
   * 读取结算记录，并为已同意的种子交换补一次种子结算。
   * 该交换在 exchangeApi 种子里已经是 accepted，因此冻结流水、
   * 双方账户扣减、结算记录必须在同一事务里落地，页面与余额流水才能对上。
   */
  async list(): Promise<ExchangeSettlement[]> {
    const settlements = await storage.get<ExchangeSettlement[]>(STORAGE_KEYS.settlements, []);
    const exchanges = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
    const seededExchange = exchanges.find((item) => item.id === SEED_SETTLEMENT_EXCHANGE_ID);
    if (!seededExchange || findSettlement(settlements, SEED_SETTLEMENT_EXCHANGE_ID)) {
      return settlements;
    }
    return seedAcceptedExchange(seededExchange);
  },

  /**
   * 同意交换并创建诚信金结算：双方各冻结 EARNEST_POINTS。
   * 冻结流水 ×2、双方账户、结算记录、交换状态在同一个 storage.txn 中提交，
   * 任一方余额不足 / 任一步失败 -> 整体不提交，交换仍是 pending。
   * 已存在结算记录时直接回读（重复点击、刷新重放幂等）。
   */
  async accept(exchangeId: string, operatorId: string): Promise<ExchangeSettlement> {
    return withLock(SETTLEMENT_LOCK_NAME, () =>
      storage.txn(async (ctx) => {
        const exchanges = await ctx.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
        const exchange = findExchangeOrThrow(exchanges, exchangeId);
        if (operatorId !== exchange.to_user_id) {
          throw new Error('只有收到请求的一方可以同意交换');
        }
        const existingSettlements = await ctx.get<ExchangeSettlement[]>(STORAGE_KEYS.settlements, []);
        const existing = findSettlement(existingSettlements, exchangeId);
        if (existing) {
          // 每笔交换只能结算一次：已冻结过直接回读，状态/余额不再变动
          return { snapshot: {}, result: existing };
        }
        if (exchange.status !== ExchangeStatus.PENDING) {
          throw new Error('当前交换状态不允许同意操作');
        }
        if (!EXCHANGE_ACTION_FLOW[ExchangeStatus.PENDING].includes(ExchangeStatus.ACCEPTED)) {
          throw new Error('当前状态不允许该操作');
        }

        const accounts = await ctx.get<PointAccount[]>(STORAGE_KEYS.pointAccounts, []);
        const entries = await ctx.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
        const now = stamp();
        const nextExchange: Exchange = { ...exchange, status: ExchangeStatus.ACCEPTED, updated_at: now };
        const settlement: ExchangeSettlement = {
          id: storage.createId('settlement'),
          exchange_id: exchangeId,
          from_user_id: exchange.from_user_id,
          to_user_id: exchange.to_user_id,
          amount_per_side: EARNEST_POINTS,
          status: SettlementStatus.FROZEN,
          confirmed_by_from: false,
          confirmed_by_to: false,
          canceled_by: null,
          frozen_at: now,
          settled_at: null,
          updated_at: now,
        };

        // freezeForExchange 对任意一方余额不足都会抛错，整个事务随之放弃
        const { accounts: nextAccounts, entries: freezeEntries } = freezeForExchange(
          accounts,
          [exchange.from_user_id, exchange.to_user_id],
          exchangeId,
          DEFAULT_POINT_BALANCE,
        );

        return {
          snapshot: {
            [STORAGE_KEYS.exchanges]: exchanges.map((item) => (item.id === exchangeId ? nextExchange : item)),
            [STORAGE_KEYS.settlements]: [...existingSettlements, settlement],
            [STORAGE_KEYS.pointAccounts]: nextAccounts,
            [STORAGE_KEYS.pointEntries]: [...entries, ...freezeEntries],
          },
          result: settlement,
        };
      }),
    );
  },

  /**
   * 一方确认完成，只落自己的确认位；双方都确认时才把交换置为 completed、
   * 物品置为 exchanged、双方诚信金原额解冻，全部在同一事务提交。
   * 本人重复确认、刷新重放一律幂等返回，不写任何数据。
   */
  async confirmComplete(exchangeId: string, operatorId: string): Promise<ExchangeSettlement> {
    return withLock(SETTLEMENT_LOCK_NAME, () =>
      storage.txn(async (ctx) => {
        const exchanges = await ctx.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
        const exchange = findExchangeOrThrow(exchanges, exchangeId);
        assertParty(exchange, operatorId);

        const settlements = await ctx.get<ExchangeSettlement[]>(STORAGE_KEYS.settlements, []);
        const settlement = findSettlement(settlements, exchangeId);
        if (!settlement) {
          throw new Error('交换尚未冻结诚信金，无法确认完成');
        }
        // 并发/重放：另一个调用已经完成解冻，直接幂等回读，不重复结算
        if (settlement.status === SettlementStatus.RELEASED) {
          return { snapshot: {}, result: settlement };
        }
        if (settlement.status !== SettlementStatus.FROZEN) {
          throw new Error('交换已取消，诚信金已赔付，不能确认完成');
        }
        if (exchange.status !== ExchangeStatus.ACCEPTED) {
          throw new Error('交换已结束，不能重复确认');
        }

        const isFrom = operatorId === exchange.from_user_id;
        const alreadyConfirmed = isFrom ? settlement.confirmed_by_from : settlement.confirmed_by_to;
        if (alreadyConfirmed) {
          return { snapshot: {}, result: settlement };
        }

        const now = stamp();
        const nextSettlement: ExchangeSettlement = {
          ...settlement,
          confirmed_by_from: settlement.confirmed_by_from || isFrom,
          confirmed_by_to: settlement.confirmed_by_to || !isFrom,
          updated_at: now,
        };
        const bothConfirmed = nextSettlement.confirmed_by_from && nextSettlement.confirmed_by_to;

        if (!bothConfirmed) {
          return {
            snapshot: {
              [STORAGE_KEYS.settlements]: settlements.map((item) =>
                item.exchange_id === exchangeId ? nextSettlement : item,
              ),
            },
            result: nextSettlement,
          };
        }

        // 双方齐确认：解冻 + 完成交换 + 物品状态，一次持久化，任一失败全回滚
        const accounts = await ctx.get<PointAccount[]>(STORAGE_KEYS.pointAccounts, []);
        const entries = await ctx.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
        const items = await ctx.get<Item[]>(STORAGE_KEYS.items, []);
        const { accounts: nextAccounts, entries: releaseEntries } = releaseForCompletion(
          accounts,
          [exchange.from_user_id, exchange.to_user_id],
          exchangeId,
          settlement.amount_per_side,
        );
        const completedSettlement: ExchangeSettlement = {
          ...nextSettlement,
          status: SettlementStatus.RELEASED,
          settled_at: now,
        };
        const nextExchange: Exchange = { ...exchange, status: ExchangeStatus.COMPLETED, updated_at: now };
        const nextItems = items.map((item) =>
          item.id === exchange.from_item_id || item.id === exchange.to_item_id
            ? { ...item, status: ItemStatus.EXCHANGED }
            : item,
        );

        return {
          snapshot: {
            [STORAGE_KEYS.exchanges]: exchanges.map((item) => (item.id === exchangeId ? nextExchange : item)),
            [STORAGE_KEYS.items]: nextItems,
            [STORAGE_KEYS.settlements]: settlements.map((item) =>
              item.exchange_id === exchangeId ? completedSettlement : item,
            ),
            [STORAGE_KEYS.pointAccounts]: nextAccounts,
            [STORAGE_KEYS.pointEntries]: [...entries, ...releaseEntries],
          },
          result: completedSettlement,
        };
      }),
    );
  },

  /**
   * 任一方在"已同意"后取消：仅取消方冻结份额转给对方，另一方可用
   * 积分不变（本人冻结份额解冻）。取消方违约流水、对方解冻+赔付两条
   * 流水、双方账户、交换与结算状态同一事务提交，任一失败全部回滚。
   */
  async cancel(exchangeId: string, operatorId: string): Promise<ExchangeSettlement> {
    return withLock(SETTLEMENT_LOCK_NAME, () =>
      storage.txn(async (ctx) => {
        const exchanges = await ctx.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
        const exchange = findExchangeOrThrow(exchanges, exchangeId);
        assertParty(exchange, operatorId);

        const settlements = await ctx.get<ExchangeSettlement[]>(STORAGE_KEYS.settlements, []);
        const settlement = findSettlement(settlements, exchangeId);
        if (!settlement) {
          throw new Error('交换尚未冻结诚信金，不能取消结算');
        }
        if (settlement.status !== SettlementStatus.FROZEN || exchange.status !== ExchangeStatus.ACCEPTED) {
          // 已解冻/已赔付：取消不可重放，回读已有结算（一笔交换只结算一次）
          return { snapshot: {}, result: settlement };
        }

        const accounts = await ctx.get<PointAccount[]>(STORAGE_KEYS.pointAccounts, []);
        const entries = await ctx.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
        const now = stamp();
        const counterpartId =
          operatorId === exchange.from_user_id ? exchange.to_user_id : exchange.from_user_id;
        const { accounts: nextAccounts, entries: cancelEntries } = compensateForCancel(
          accounts,
          operatorId,
          counterpartId,
          exchangeId,
          settlement.amount_per_side,
        );
        const canceledSettlement: ExchangeSettlement = {
          ...settlement,
          status: SettlementStatus.COMPENSATED,
          canceled_by: operatorId,
          settled_at: now,
          updated_at: now,
        };
        const canceledExchange: Exchange = { ...exchange, status: ExchangeStatus.CANCELLED, updated_at: now };

        return {
          snapshot: {
            [STORAGE_KEYS.exchanges]: exchanges.map((item) =>
              item.id === exchangeId ? canceledExchange : item,
            ),
            [STORAGE_KEYS.settlements]: settlements.map((item) =>
              item.exchange_id === exchangeId ? canceledSettlement : item,
            ),
            [STORAGE_KEYS.pointAccounts]: nextAccounts,
            [STORAGE_KEYS.pointEntries]: [...entries, ...cancelEntries],
          },
          result: canceledSettlement,
        };
      }),
    );
  },
};
