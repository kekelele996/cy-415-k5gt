import { PointsFlowType, SEED_POINTS_BALANCE } from '@/constants/deposit';
import type { PointsAccount, PointsFlow } from '@/models/points';
import type { User } from '@/models/user';
import { STORAGE_KEYS, storage, type StorageTransaction } from '@/utils/storage';

import { userApi } from './userApi';

/** 演示用户初始积分：user_chen 仅 10 点，可演示“余额不足整次拒绝” */
const SEED_BALANCES: Record<string, number> = {
  user_me: 100,
  user_lin: 100,
  user_chen: 10,
};

const loadAccounts = (tx: StorageTransaction) => tx.get<PointsAccount[]>(STORAGE_KEYS.pointsAccounts, []);
const loadFlows = (tx: StorageTransaction) => tx.get<PointsFlow[]>(STORAGE_KEYS.pointsLedger, []);

export interface FlowInput {
  user_id: string;
  exchange_id: string;
  type: PointsFlowType;
  available_delta: number;
  frozen_delta: number;
  idempotency_key: string;
  remark: string;
}

export const pointsApi = {
  /** 首次使用时为全部用户建立积分账户与初始流水，幂等 */
  async ensureSeedAccounts(tx: StorageTransaction, users: User[]): Promise<PointsAccount[]> {
    const accounts = await loadAccounts(tx);
    if (accounts.length) return accounts;

    const timestamp = new Date().toISOString();
    const nextAccounts: PointsAccount[] = users.map((user) => ({
      user_id: user.id,
      available: SEED_BALANCES[user.id] ?? SEED_POINTS_BALANCE,
      frozen: 0,
      updated_at: timestamp,
    }));
    const seedFlows: PointsFlow[] = nextAccounts.map((account) => ({
      id: storage.createId('points_flow'),
      user_id: account.user_id,
      exchange_id: '',
      type: PointsFlowType.SEED,
      available_delta: account.available,
      frozen_delta: 0,
      balance_after: account.available,
      frozen_after: 0,
      idempotency_key: `seed:${account.user_id}`,
      remark: '平台积分初始发放',
      created_at: timestamp,
    }));

    tx.stage(STORAGE_KEYS.pointsAccounts, nextAccounts);
    tx.stage(STORAGE_KEYS.pointsLedger, seedFlows);
    return nextAccounts;
  },

  /**
   * 记一笔积分流水并更新账户，必须在结算事务内调用。
   * - 幂等键已存在则直接返回原流水（刷新重放/重复结算不会二次入账）；
   * - 推导余额出现负数说明结算数据被破坏，抛错让整笔事务回滚。
   */
  async applyFlow(tx: StorageTransaction, input: FlowInput): Promise<PointsFlow> {
    const flows = await loadFlows(tx);
    const existing = flows.find((flow) => flow.idempotency_key === input.idempotency_key);
    if (existing) return existing;

    const accounts = await loadAccounts(tx);
    const account = accounts.find((item) => item.user_id === input.user_id);
    if (!account) throw new Error('积分账户不存在，结算已全部回滚');

    const balanceAfter = account.available + input.available_delta;
    const frozenAfter = account.frozen + input.frozen_delta;
    if (balanceAfter < 0 || frozenAfter < 0) {
      throw new Error('积分余额不足，结算已全部回滚');
    }

    const flow: PointsFlow = {
      id: storage.createId('points_flow'),
      user_id: input.user_id,
      exchange_id: input.exchange_id,
      type: input.type,
      available_delta: input.available_delta,
      frozen_delta: input.frozen_delta,
      balance_after: balanceAfter,
      frozen_after: frozenAfter,
      idempotency_key: input.idempotency_key,
      remark: input.remark,
      created_at: new Date().toISOString(),
    };

    const nextAccount: PointsAccount = {
      ...account,
      available: balanceAfter,
      frozen: frozenAfter,
      updated_at: flow.created_at,
    };
    tx.stage(
      STORAGE_KEYS.pointsAccounts,
      accounts.map((item) => (item.user_id === input.user_id ? nextAccount : item)),
    );
    tx.stage(STORAGE_KEYS.pointsLedger, [flow, ...flows]);
    return flow;
  },

  async listAccounts(): Promise<PointsAccount[]> {
    return storage.get<PointsAccount[]>(STORAGE_KEYS.pointsAccounts, []);
  },

  async listFlows(): Promise<PointsFlow[]> {
    return storage.get<PointsFlow[]>(STORAGE_KEYS.pointsLedger, []);
  },

  /** 启动时播种积分账户（幂等），让钱包在首次结算前就有初始余额 */
  async bootstrap(): Promise<PointsAccount[]> {
    const users = await userApi.list();
    return storage.transaction((tx) => this.ensureSeedAccounts(tx, users));
  },
};
