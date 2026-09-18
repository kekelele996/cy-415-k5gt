import { SettlementStatus } from '@/constants/settlement';

/**
 * 交换诚信金结算记录，与 Exchange 一一对应（仅在"同意交换"时创建一次）。
 * 每笔交换终身只有一条结算记录，完成 / 取消都是在该记录上做一次状态迁移，
 * 这是"每笔交换只能结算一次"的持久化依据。
 */
export interface ExchangeSettlement {
  id: string;
  exchange_id: string;
  from_user_id: string;
  to_user_id: string;
  /** 冻结时写死每方 EARNEST_POINTS，后续解冻/赔付都按该数额处理 */
  amount_per_side: number;
  status: SettlementStatus;
  /** 双方确认完成的标记；两边都为 true 才允许原额解冻 */
  confirmed_by_from: boolean;
  confirmed_by_to: boolean;
  /** 取消方；完成解冻或仍冻结中时为 null */
  canceled_by: string | null;
  frozen_at: string;
  settled_at: string | null;
  updated_at: string;
}
