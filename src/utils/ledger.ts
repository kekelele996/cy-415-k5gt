import { EARNEST_POINTS, PointEntryType } from '@/constants/point';
import type { PointAccount, PointEntry } from '@/models/point';
import { storage } from '@/utils/storage';

/** 余额不足时抛出的错误，事务 producer 抛出后 storage.txn 不会提交任何写入 */
export class InsufficientPointsError extends Error {
  constructor(
    public userId: string,
    public required: number,
  ) {
    super('平台积分余额不足，无法冻结诚信金');
    this.name = 'InsufficientPointsError';
  }
}

const stamp = () => new Date().toISOString();

/** 若账户不存在则按初始余额开一个，保证种子用户与新用户行为一致 */
export const ensureAccount = (accounts: PointAccount[], userId: string, fallbackBalance: number): PointAccount => {
  const existing = accounts.find((account) => account.user_id === userId);
  if (existing) return existing;
  return { user_id: userId, balance: fallbackBalance, frozen: 0, updated_at: stamp() };
};

const buildEntry = (
  account: PointAccount,
  exchangeId: string,
  type: PointEntryType,
  amount: number,
  frozenDelta: number,
  remark: string,
): PointEntry => ({
  id: storage.createId('point_entry'),
  user_id: account.user_id,
  exchange_id: exchangeId,
  type,
  amount,
  frozen_delta: frozenDelta,
  balance_after: account.balance,
  frozen_after: account.frozen,
  remark,
  created_at: stamp(),
});

/**
 * 冻结一笔诚信金。任一一方可用余额不足都抛 InsufficientPointsError，
 * producer 整体失败，事务不会提交——"余额不足时整次拒绝"。
 */
export const freezeForExchange = (
  accounts: PointAccount[],
  userIds: [string, string],
  exchangeId: string,
  fallbackBalance: number,
): { accounts: PointAccount[]; entries: PointEntry[] } => {
  const nextAccounts = accounts.map((account) => ({ ...account }));
  const entries: PointEntry[] = [];
  for (const userId of userIds) {
    const account = ensureAccount(nextAccounts, userId, fallbackBalance);
    if (!nextAccounts.some((item) => item.user_id === userId)) nextAccounts.push(account);
    if (account.balance < EARNEST_POINTS) {
      throw new InsufficientPointsError(userId, EARNEST_POINTS);
    }
    account.balance -= EARNEST_POINTS;
    account.frozen += EARNEST_POINTS;
    account.updated_at = stamp();
    entries.push(
      buildEntry(
        account,
        exchangeId,
        PointEntryType.FREEZE,
        -EARNEST_POINTS,
        EARNEST_POINTS,
        `交换诚信金冻结（每方 ${EARNEST_POINTS} 点）`,
      ),
    );
  }
  return { accounts: nextAccounts, entries };
};

/** 双方确认完成：各自原额解冻，双方积分恢复到冻结前 */
export const releaseForCompletion = (
  accounts: PointAccount[],
  userIds: [string, string],
  exchangeId: string,
  amount: number,
): { accounts: PointAccount[]; entries: PointEntry[] } => {
  const nextAccounts = accounts.map((account) => ({ ...account }));
  const entries: PointEntry[] = [];
  for (const userId of userIds) {
    const account = nextAccounts.find((item) => item.user_id === userId);
    if (!account) throw new Error(`用户 ${userId} 的积分账户不存在`);
    if (account.frozen < amount) throw new Error('冻结积分与诚信金记录不一致');
    account.frozen -= amount;
    account.balance += amount;
    account.updated_at = stamp();
    entries.push(
      buildEntry(
        account,
        exchangeId,
        PointEntryType.UNFREEZE,
        amount,
        -amount,
        `双方确认完成，诚信金原额解冻（${amount} 点）`,
      ),
    );
  }
  return { accounts: nextAccounts, entries };
};

/**
 * 一方取消：
 * - canceler（取消方）：冻结份额被划走（冻结 -amount，可用不变，净损失 amount）
 * - counterpart（另一方）：自身冻结份额解冻 + 收到对方份额赔付
 *   （冻结 -amount，可用 +amount，净积分不变且得到对方冻结份额）
 */
export const compensateForCancel = (
  accounts: PointAccount[],
  cancelerId: string,
  counterpartId: string,
  exchangeId: string,
  amount: number,
): { accounts: PointAccount[]; entries: PointEntry[] } => {
  const nextAccounts = accounts.map((account) => ({ ...account }));
  const canceler = nextAccounts.find((item) => item.user_id === cancelerId);
  const counterpart = nextAccounts.find((item) => item.user_id === counterpartId);
  if (!canceler || !counterpart) throw new Error('积分账户不存在，无法完成取消赔付');
  if (canceler.frozen < amount || counterpart.frozen < amount) {
    throw new Error('冻结积分与诚信金记录不一致');
  }

  canceler.frozen -= amount;
  canceler.updated_at = stamp();
  const cancelerEntry = buildEntry(
    canceler,
    exchangeId,
    PointEntryType.FORFEIT,
    0,
    -amount,
    `取消交换，冻结诚信金 ${amount} 点划转给对方`,
  );

  // 另一方：本人冻结份额原额解冻（balance +amount, frozen -amount），
  // 再收到取消方划来的冻结份额（balance +amount），可用积分因此净增 amount。
  counterpart.frozen -= amount;
  counterpart.balance += amount;
  counterpart.updated_at = stamp();
  const counterpartUnfreeze = buildEntry(
    counterpart,
    exchangeId,
    PointEntryType.UNFREEZE,
    amount,
    -amount,
    `对方取消，本人诚信金 ${amount} 点原额解冻`,
  );
  counterpart.balance += amount;
  counterpart.updated_at = stamp();
  const counterpartCompensate = buildEntry(
    counterpart,
    exchangeId,
    PointEntryType.COMPENSATE,
    amount,
    0,
    `收到取消方赔付的冻结份额（${amount} 点）`,
  );

  return { accounts: nextAccounts, entries: [cancelerEntry, counterpartUnfreeze, counterpartCompensate] };
};
