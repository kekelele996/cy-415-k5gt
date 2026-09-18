import type { PointEntryType } from '@/constants/point';

/** 平台积分账户，一个用户一个，与 User 解耦存在独立存储键 */
export interface PointAccount {
  user_id: string;
  /** 可用积分 */
  balance: number;
  /** 冻结中的积分（各笔已同意交换的诚信金之和） */
  frozen: number;
  updated_at: string;
}

/** 积分流水（余额明细），每一次余额/冻结变动一行 */
export interface PointEntry {
  id: string;
  user_id: string;
  exchange_id: string;
  type: PointEntryType;
  /** 带符号的可用余额变动，未变动为 0 */
  amount: number;
  /** 带符号的冻结积分变动，未变动为 0 */
  frozen_delta: number;
  /** 本笔之后的可用余额，回读流水时与账户余额逐笔对齐 */
  balance_after: number;
  /** 本笔之后的冻结积分 */
  frozen_after: number;
  remark: string;
  created_at: string;
}

export type PointAccountDraft = Pick<PointAccount, 'user_id'> & Partial<Pick<PointAccount, 'balance' | 'frozen'>>;
