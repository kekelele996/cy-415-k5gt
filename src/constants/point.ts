/** 每方冻结的平台积分（诚信金），写死由平台规则决定 */
export const EARNEST_POINTS = 20;

/** 新用户开通积分账户的初始余额，保证演示账户足以冻结一笔诚信金 */
export const DEFAULT_POINT_BALANCE = 100;

/** 已同意且已冻结诚信金的演示交换 id，结算/钱包种子数据用它对齐 */
export const SEED_SETTLEMENT_EXCHANGE_ID = 'exchange_seed_accepted';

/** 结算互斥锁标识，见 utils/withLock.ts */
export const SETTLEMENT_LOCK_NAME = 'reswap-settlement';

/**
 * 积分流水类型。
 * FREEZE   冻结（可用 -> 冻结）
 * UNFREEZE 解冻（冻结 -> 可用）
 * FORFEIT  违约扣划（取消方冻结份额被划走）
 * COMPENSATE  取消方份额赔付到对方可用余额
 */
export enum PointEntryType {
  FREEZE = 'freeze',
  UNFREEZE = 'unfreeze',
  FORFEIT = 'forfeit',
  COMPENSATE = 'compensate',
}
