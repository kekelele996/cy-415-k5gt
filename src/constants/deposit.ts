/** 诚信金结算状态：与 ExchangeStatus 一一对应，记录结算单自身进度 */
export enum DepositStatus {
  /** 双方积分已冻结，等待完成或取消 */
  HELD = 'held',
  /** 双方确认完成，冻结原额解冻 */
  RELEASED = 'released',
  /** 一方取消，取消方冻结份额赔付给对方 */
  FORFEITED = 'forfeited',
}

/** 平台积分流水类型 */
export enum PointsFlowType {
  /** 初始积分 */
  SEED = 'seed',
  /** 诚信金冻结（可用 -> 冻结） */
  FREEZE = 'freeze',
  /** 诚信金解冻（冻结 -> 可用，原额） */
  RELEASE = 'release',
  /** 守约方收到取消方赔付份额 */
  COMPENSATE = 'compensate',
  /** 取消方冻结份额被划出赔付给对方 */
  FORFEIT = 'forfeit',
}

/** 每方冻结的平台积分：双方各 20 点 */
export const DEPOSIT_AMOUNT = 20;

/** 演示用户初始平台积分 */
export const SEED_POINTS_BALANCE = 100;

export const DEPOSIT_STATUS_OPTIONS = [
  { label: '冻结中', value: DepositStatus.HELD },
  { label: '已解冻', value: DepositStatus.RELEASED },
  { label: '已赔付', value: DepositStatus.FORFEITED },
];

export const POINTS_FLOW_LABELS: Record<PointsFlowType, string> = {
  [PointsFlowType.SEED]: '初始积分',
  [PointsFlowType.FREEZE]: '交换诚信金冻结',
  [PointsFlowType.RELEASE]: '交换诚信金解冻',
  [PointsFlowType.COMPENSATE]: '收到取消方诚信金',
  [PointsFlowType.FORFEIT]: '取消交换，诚信金赔付划出',
};
