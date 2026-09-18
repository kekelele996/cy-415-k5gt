import { DEFAULT_POINT_BALANCE } from '@/constants/point';
import type { PointAccount, PointEntry } from '@/models/point';

import { userApi } from './userApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { ensureAccount } from '@/utils/ledger';

export const walletApi = {
  /** 读取全部积分账户；首次访问时按用户列表初始化种子账户 */
  async accounts(): Promise<PointAccount[]> {
    const accounts = await storage.get<PointAccount[]>(STORAGE_KEYS.pointAccounts, []);
    if (accounts.length) return accounts;

    const users = await userApi.list();
    const seeded = users.map((user) =>
      ensureAccount([], user.id, DEFAULT_POINT_BALANCE),
    );
    await storage.set(STORAGE_KEYS.pointAccounts, seeded);
    return seeded;
  },

  async accountOf(userId: string): Promise<PointAccount> {
    const accounts = await this.accounts();
    const account = accounts.find((item) => item.user_id === userId);
    if (account) return account;
    // 用户存在但账户缺失（老数据升级）：补开一个
    const opened = ensureAccount(accounts, userId, DEFAULT_POINT_BALANCE);
    await storage.set(STORAGE_KEYS.pointAccounts, [...accounts, opened]);
    return opened;
  },

  async entries(userId?: string): Promise<PointEntry[]> {
    const entries = await storage.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
    if (!userId) return entries;
    return entries.filter((entry) => entry.user_id === userId);
  },

  async entriesByExchange(exchangeId: string): Promise<PointEntry[]> {
    const entries = await storage.get<PointEntry[]>(STORAGE_KEYS.pointEntries, []);
    return entries.filter((entry) => entry.exchange_id === exchangeId);
  },
};
