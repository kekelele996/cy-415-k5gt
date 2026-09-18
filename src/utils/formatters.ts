import dayjs from 'dayjs';

import { ExchangeStatus } from '@/constants/exchange';
import { ItemCondition, ItemStatus } from '@/constants/item';
import { PointEntryType } from '@/constants/point';
import { SettlementStatus } from '@/constants/settlement';
import {
  POINT_ENTRY_TEXT,
  SETTLEMENT_STATUS_TEXT,
  STATUS_MESSAGE_MAP,
} from '@/constants/messages';

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
  if (status === ItemStatus.OFFLINE || status === ExchangeStatus.REJECTED) return 'status-muted';
  if (
    status === ItemStatus.EXCHANGED ||
    status === ExchangeStatus.COMPLETED ||
    status === ExchangeStatus.CANCELLED
  ) {
    return 'status-done';
  }
  return 'status-wait';
};

export const formatStatusMessage = (status: ItemStatus | ExchangeStatus) => STATUS_MESSAGE_MAP[status];

export const formatPoints = (points: number) => `${points} 点`;

export const formatPointEntryType = (type: PointEntryType) => POINT_ENTRY_TEXT[type];

export const formatSettlementStatus = (status: SettlementStatus) => SETTLEMENT_STATUS_TEXT[status];

/** 流水金额：amount（可用余额变动）与 frozen_delta（冻结变动）合并展示 */
export const formatEntryAmount = (entry: { amount: number; frozen_delta: number }): string => {
  const parts: string[] = [];
  if (entry.amount !== 0) {
    parts.push(`可用 ${entry.amount > 0 ? '+' : ''}${entry.amount}`);
  }
  if (entry.frozen_delta !== 0) {
    parts.push(`冻结 ${entry.frozen_delta > 0 ? '+' : ''}${entry.frozen_delta}`);
  }
  return parts.join(' / ') || '—';
};
