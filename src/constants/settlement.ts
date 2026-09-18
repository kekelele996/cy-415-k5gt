/**
 * 诚信金结算状态：独立于 ExchangeStatus，
 * 表达交换在"已同意"之后的结算生命周期。
 */
export enum SettlementStatus {
  /** 诚信金已冻结，等待双方确认完成/取消 */
  FROZEN = 'frozen',
  /** 双方均已确认完成，诚信金原额解冻 */
  RELEASED = 'released',
  /** 一方取消，取消方冻结份额已划转给对方 */
  COMPENSATED = 'compensated',
}

export const SETTLEMENT_STATUS_OPTIONS = [
  { label: '冻结中', value: SettlementStatus.FROZEN },
  { label: '已解冻', value: SettlementStatus.RELEASED },
  { label: '已赔付', value: SettlementStatus.COMPENSATED },
];
