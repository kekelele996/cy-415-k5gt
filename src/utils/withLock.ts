/**
 * 结算串行锁。
 *
 * - 同一标签页内：所有等待者串成 Promise 链，杜绝"双方同时操作/重复点击"并发。
 * - 跨标签页：优先使用 Web Locks API（navigator.locks），刷新重放、多标签
 *   同时结算时也只有一个执行者拿到锁；不支持时退化为同标签页锁。
 *
 * 幂等性的持久化保证在 settlementApi（结算状态机 + 每交换唯一记录），
 * 这里只负责把并发请求压成串行，让状态机判定不会被竞态打穿。
 */
const chains = new Map<string, Promise<unknown>>();

const chainExclusive = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const previous = chains.get(name) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  chains.set(name, next);
  try {
    await previous;
    return await task();
  } finally {
    release!();
    if (chains.get(name) === next) chains.delete(name);
  }
};

export const withLock = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    return navigator.locks.request(name, () => chainExclusive(name, task));
  }
  return chainExclusive(name, task);
};
