// 内存版 idb-keyval：保持 setMany 单事务“全写或全不写”语义
const store = new Map();
let failNext = false;

export const get = async (key) => (store.has(key) ? structuredClone(store.get(key)) : undefined);
export const set = async (key, value) => {
  store.set(key, structuredClone(value));
};
export const del = async (key) => {
  store.delete(key);
};
export const setMany = async (entries) => {
  if (failNext) {
    failNext = false;
    throw new Error('simulated IndexedDB transaction failure');
  }
  // 先克隆全部，再一次性提交（任一克隆失败都不会污染存储）
  const cloned = entries.map(([k, v]) => [k, structuredClone(v)]);
  for (const [k, v] of cloned) store.set(k, v);
};
export const clear = async () => store.clear();

// 测试钩子
export const __setFail = (v) => {
  failNext = v;
};
export const __dump = () => store;
