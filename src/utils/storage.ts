import { del, get, set } from 'idb-keyval';

import type { PersistedEnvelope, TransactionSnapshot } from '@/types';

const STORAGE_VERSION = 1;
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 365;

const prefixed = (key: string) => `reswap:${key}`;

export const STORAGE_KEYS = {
  currentUserId: prefixed('current-user-id'),
  users: prefixed('users'),
  items: prefixed('items'),
  exchanges: prefixed('exchanges'),
  pointAccounts: prefixed('point-accounts'),
  pointEntries: prefixed('point-entries'),
  settlements: prefixed('exchange-settlements'),
  theme: prefixed('theme'),
  lastClean: prefixed('last-clean'),
};

const now = () => Date.now();

const envelope = <T>(payload: T, ttl = DEFAULT_TTL): PersistedEnvelope<T> => ({
  version: STORAGE_VERSION,
  expiresAt: now() + ttl,
  payload,
});

const toPlain = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

const isExpired = <T>(data: PersistedEnvelope<T> | null) => {
  if (!data) return false;
  return Boolean(data.expiresAt && data.expiresAt < now());
};

const parseLocal = <T>(key: string): PersistedEnvelope<T> | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedEnvelope<T>;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeLocal = <T>(key: string, payload: T, ttl?: number) => {
  localStorage.setItem(key, JSON.stringify(envelope(payload, ttl)));
};

export const storage = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const localEnvelope = parseLocal<T>(key);
    if (isExpired(localEnvelope)) {
      await this.remove(key);
      return fallback;
    }
    if (localEnvelope?.version === STORAGE_VERSION) {
      return localEnvelope.payload;
    }

    const indexedEnvelope = await get<PersistedEnvelope<T>>(key);
    if (isExpired(indexedEnvelope ?? null)) {
      await this.remove(key);
      return fallback;
    }
    if (indexedEnvelope?.version === STORAGE_VERSION) {
      writeLocal(key, indexedEnvelope.payload);
      return indexedEnvelope.payload;
    }
    return fallback;
  },

  async set<T>(key: string, payload: T, ttl?: number): Promise<T> {
    const plainPayload = toPlain(payload);
    const packed = envelope(plainPayload, ttl);
    localStorage.setItem(key, JSON.stringify(packed));
    await set(key, packed);
    return plainPayload;
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    await del(key);
  },

  /**
   * 原子事务：producer 内通过 ctx.get 读取本次涉及的存储键，返回
   * { snapshot, result }；snapshot 中每个键的 payload 会被一次性提交：
   * 先全量写 localStorage，再全量写 IndexedDB。任一写入失败，
   * 已写入的键全部恢复到事务开始前的值，保证"冻结/解冻/赔付 + 交换状态"
   * 要么一起生效，要么全部回到结算前。
   */
  async txn<T>(
    producer: (ctx: {
      get: <D>(key: string, fallback: D) => Promise<D>;
    }) => Promise<{ snapshot: TransactionSnapshot; result: T }>,
  ): Promise<T> {
    const { snapshot, result } = await producer({
      get: (key, fallback) => this.get(key, fallback),
    });
    const keys = Object.keys(snapshot);

    // 提交前抓取每个键的原始 envelope，ctx.get 已保证 localStorage 与
    // IndexedDB 内容一致，因此它同时是两个存储的回滚依据。
    const originalPacked = new Map<string, string | null>();
    for (const key of keys) {
      originalPacked.set(key, localStorage.getItem(key));
    }

    const restoreLocal = () => {
      for (const key of keys) {
        const packed = originalPacked.get(key);
        if (packed === null || packed === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, packed);
        }
      }
    };

    const restoreIndexed = async () => {
      await Promise.all(
        keys.map(async (key) => {
          const packed = originalPacked.get(key);
          if (packed === null || packed === undefined) {
            await del(key);
          } else {
            await set(key, JSON.parse(packed));
          }
        }),
      );
    };

    // 阶段一：localStorage 全量提交
    const localWritten: string[] = [];
    try {
      for (const key of keys) {
        writeLocal(key, snapshot[key]);
        localWritten.push(key);
      }
    } catch (error) {
      restoreLocal();
      throw error;
    }

    // 阶段二：IndexedDB 全量提交，失败则两个存储一并回滚
    try {
      for (const key of keys) {
        const packed = localStorage.getItem(key);
        if (!packed) throw new Error('事务本地快照丢失');
        await set(key, JSON.parse(packed));
      }
    } catch (error) {
      await restoreIndexed();
      restoreLocal();
      throw error;
    }

    return result;
  },

  async cleanExpired(): Promise<void> {
    const keys = Object.values(STORAGE_KEYS);
    await Promise.all(
      keys.map(async (key) => {
        const localEnvelope = parseLocal<unknown>(key);
        if (isExpired(localEnvelope)) {
          await this.remove(key);
        }
      }),
    );
    localStorage.setItem(STORAGE_KEYS.lastClean, JSON.stringify(envelope(new Date().toISOString())));
  },

  createId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  },
};
