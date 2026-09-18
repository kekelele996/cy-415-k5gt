import dayjs from 'dayjs';

import { DepositStatus, POINTS_FLOW_LABELS, PointsFlowType } from '@/constants/deposit';
import { ExchangeStatus } from '@/constants/exchange';
import { ItemCondition, ItemStatus } from '@/constants/item';
import { STATUS_MESSAGE_MAP } from '@/constants/messages';

export const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm');

export const formatItemStatus = (status: ItemStatus) => {
  const map: Record<ItemStatus, string> = {
    [ItemStatus.AVAILABLE]: '可交换',
    [ItemStatus.EXCHANGED]: '已交换',
    [ItemStatus.OFFLINE]: '已下架',
  };
  return map[status];
};

export const formatExchangeStatus = (status: ExchangeStatus) => {
  const map: Record<ExchangeStatus, string> = {
    [ExchangeStatus.PENDING]: '待确认',
    [ExchangeStatus.ACCEPTED]: '已同意',
    [ExchangeStatus.REJECTED]: '已拒绝',
    [ExchangeStatus.COMPLETED]: '已完成',
    [ExchangeStatus.CANCELLED]: '已取消',
  };
  return map[status];
};

export const formatDepositStatus = (status: DepositStatus) => {
  const map: Record<DepositStatus, string> = {
    [DepositStatus.HELD]: '诚信金冻结中',
    [DepositStatus.RELEASED]: '诚信金已解冻',
    [DepositStatus.FORFEITED]: '诚信金已赔付',
  };
  return map[status];
};

export const formatPointsFlowType = (type: PointsFlowType) => POINTS_FLOW_LABELS[type] ?? '积分变动';

export const formatPointsDelta = (availableDelta: number, frozenDelta: number) => {
  if (frozenDelta > 0) return `冻结 ${frozenDelta}`;
  if (frozenDelta < 0 && availableDelta > 0)
    return availableDelta === -frozenDelta ? `解冻 ${-frozenDelta}` : `可用 +${availableDelta} / 冻结 ${frozenDelta}`;
  if (availableDelta > 0) return `+${availableDelta}`;
  if (availableDelta < 0) return `${availableDelta}`;
  return frozenDelta < 0 ? `赔付 ${frozenDelta}` : '0';
};

export const formatCondition = (condition: ItemCondition) => {
  const map: Record<ItemCondition, string> = {
    [ItemCondition.NEW]: '全新',
    [ItemCondition.LIKE_NEW]: '九成新',
    [ItemCondition.GOOD]: '八成新',
    [ItemCondition.WORN]: '战损',
  };
  return map[condition];
};

export const formatCreditLevel = (score: number) => {
  if (score >= 90) return '守约达人';
  if (score >= 75) return '稳定交换';
  if (score >= 60) return '新晋用户';
  return '需谨慎';
};

export const statusToneClass = (status: ItemStatus | ExchangeStatus) => {
  if (status === ItemStatus.AVAILABLE || status === ExchangeStatus.ACCEPTED) return 'status-good';
  if (status === ItemStatus.OFFLINE || status === ExchangeStatus.REJECTED || status === ExchangeStatus.CANCELLED)
    return 'status-muted';
  if (status === ItemStatus.EXCHANGED || status === ExchangeStatus.COMPLETED) return 'status-done';
  return 'status-wait';
};

export const formatStatusMessage = (status: ItemStatus | ExchangeStatus) => STATUS_MESSAGE_MAP[status];
