import type { ExchangeStatus } from '@/constants/exchange';
import type { ItemCondition, ItemStatus } from '@/constants/item';

export interface Option<T extends string> {
  label: string;
  value: T;
}

export interface PersistedEnvelope<T> {
  version: number;
  expiresAt?: number;
  payload: T;
}

export interface StatusFilter {
  item?: ItemStatus;
  exchange?: ExchangeStatus;
  condition?: ItemCondition;
}

export interface ImageFilePayload {
  id: string;
  name: string;
  dataUrl: string;
}

/**
 * 一次结算事务内需要原子持久化的存储快照。
 * key 为 STORAGE_KEYS 中的键，value 为该键要整体写入的 payload。
 */
export type TransactionSnapshot = Record<string, unknown>;
