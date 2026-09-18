import { DepositStatus, PointsFlowType } from '@/constants/deposit';

/**
 * 平台积分账户：available 为可用余额，frozen 为被交换诚信金冻结的份额。
 * 账户恒等式：available + frozen = 累计净积分（赔付会改变净额）。
 */
export interface PointsAccount {
  user_id: string;
  available: number;
  frozen: number;
  updated_at: string;
}

/**
 * 平台积分流水：每一次冻结/解冻/赔付都成对落账。
 * idempotency_key 为业务幂等键，同一交换同一动作绝不重复入账。
 */
export interface PointsFlow {
  id: string;
  user_id: string;
  exchange_id: string;
  type: PointsFlowType;
  /** 可用积分变化（正为增加，负为扣减） */
  available_delta: number;
  /** 冻结积分变化（正为冻结，负为解冻） */
  frozen_delta: number;
  /** 入账后账户余额回读快照，用于页面与流水一致性校验 */
  balance_after: number;
  frozen_after: number;
  idempotency_key: string;
  remark: string;
  created_at: string;
}

/**
 * 交换诚信金结算单：一笔交换至多一条（exchange_id 唯一）。
 * 它是“只结算一次”的权威记录：
 * - held：双方各冻结 DEPOSIT_AMOUNT；
 * - released：双方都确认完成，各自原额解冻；
 * - forfeited：cancelled_by 取消，其冻结份额转给另一方。
 */
export interface DepositSettlement {
  id: string;
  exchange_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: DepositStatus;
  /** 完成确认：from / to 双方都确认后才原额解冻 */
  confirmed_by: string[];
  /** 取消方（仅 forfeited 时有值） */
  cancelled_by: string | null;
  /** 冻结时落账的流水幂等键，解冻/赔付据此配对且防重 */
  freeze_flow_keys: string[];
  created_at: string;
  updated_at: string;
}

export type PointsFlowIdempotencyKey = string;
