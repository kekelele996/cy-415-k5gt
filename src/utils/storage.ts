import { del, get, set, setMany } from 'idb-keyval';

import type { PersistedEnvelope } from '@/types';

const STORAGE_VERSION = 1;
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 365;

const prefixed = (key: string) => `reswap:${key}`;

export const STORAGE_KEYS = {
  currentUserId: prefixed('current-user-id'),
  users: prefixed('users'),
  items: prefixed('items'),
  exchanges: prefixed('exchanges'),
  pointsAccounts: prefixed('points-accounts'),
  pointsLedger: prefixed('points-ledger'),
  depositSettlements: prefixed('deposit-settlements'),
  theme: prefixed('theme'),
  lastClean: prefixed('last-clean'),
};

const now = () => Date.now();

const envelope = <T>(payload: T, ttl = DEFAULT_TTL): PersistedEnvelope<T> => ({
  version: STORAGE_VERSION,
  expiresAt: now() + ttl,
  payload,
});

export const toPlain = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

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

/**
 * 事务上下文：结算流程在一次事务内对多个存储键做读-改-写。
 * staged 内保存各键本事务内的最新值；同一事务内读取会命中 staged，
 * 保证“冻结/解冻/取消 + 交换状态 + 物品状态”看到的是同一版本快照。
 */
export interface StorageTransaction {
  get<T>(key: string, fallback: T): Promise<T>;
  stage<T>(key: string, payload: T, ttl?: number): void;
  createId(prefix: string): string;
}

interface StagedEntry {
  key: string;
  envelope: PersistedEnvelope<unknown>;
}

/**
 * 把多个键一次提交到 IndexedDB。setMany 在 idb-keyval 内部走单个
 * readonly:'readwrite' 事务，要么全部写入，要么全部不写入——
 * 这是“任一步失败全部回到结算前”的持久化底座。
 */
const commitMany = async (entries: StagedEntry[]): Promise<void> => {
  if (!entries.length) return;
  await setMany(entries.map((entry) => [entry.key, entry.envelope] as [string, PersistedEnvelope<unknown>]));
};

const syncLocalCache = (entries: StagedEntry[], previousLocal: Map<string, string | null>): void => {
  try {
    for (const entry of entries) {
      localStorage.setItem(entry.key, JSON.stringify(entry.envelope));
    }
  } catch {
    // IndexedDB 已权威提交，localStorage 只是读缓存。
    // 缓存写入失败（例如配额/隐私模式）时回退到提交前缓存，下一次 storage.get
    // 版本不命中会自动从 IndexedDB 回填，绝不让页面读到与流水不一致的旧值。
    for (const [key, raw] of previousLocal) {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    }
  }
};

// 内存互斥队列：重复点击、双方同时操作、刷新重放进入同一线程事件循环时，
// 事务严格串行，第二个事务一定能读到第一个事务已提交的结算结果，从而只结算一次。
let txChain: Promise<unknown> = Promise.resolve();

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
   * 在一个原子事务内执行 mutate：
   * 1. 经互斥队列串行执行，杜绝同键并发交错；
   * 2. mutate 内只读写内存 staged，不落盘；
   * 3. mutate 正常返回后，staged 全部键通过 IndexedDB 单事务一次提交；
   * 4. mutate 抛错或提交失败 → staged 丢弃，绝不落盘，状态保持结算前；
   * 5. 提交成功后再同步 localStorage 读缓存，失败自动回退缓存。
   */
  transaction<T>(mutate: (tx: StorageTransaction) => Promise<T> | T): Promise<T> {
    const run = async (): Promise<T> => {
      const staged = new Map<string, StagedEntry>();
      const tx: StorageTransaction = {
        async get<R>(key: string, fallback: R): Promise<R> {
          const hit = staged.get(key);
          if (hit) return toPlain(hit.envelope.payload) as R;
          const fresh = await storage.get<R>(key, fallback);
          return fresh;
        },
        stage<R>(key: string, payload: R, ttl?: number) {
          staged.set(key, { key, envelope: envelope(toPlain(payload), ttl) });
        },
        createId(prefix: string) {
          return storage.createId(prefix);
        },
      };

      const result = await mutate(tx);

      const entries = [...staged.values()];
      const previousLocal = new Map<string, string | null>();
      for (const entry of entries) {
        previousLocal.set(entry.key, localStorage.getItem(entry.key));
      }
      try {
        await commitMany(entries);
      } catch (error) {
        // IndexedDB 提交整体失败：staged 随函数结束丢弃，无任何键被写入。
        throw error instanceof Error ? error : new Error('结算数据提交失败，已全部回滚');
      }
      syncLocalCache(entries, previousLocal);
      return result;
    };

    const result = txChain.then(run, run);
    txChain = result.then(
      () => undefined,
      () => undefined,
    );
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
