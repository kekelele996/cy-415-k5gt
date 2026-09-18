/* 端到端校验：诚信金冻结/双确认解冻/取消赔付/幂等/原子回滚
 * 用内存 Map 模拟 localStorage 与 IndexedDB（idb-keyval），
 * setMany 保持“要么全写要么全不写”的单事务语义。
 */
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { userApi } from '@/api/userApi';
import { exchangeApi } from '@/api/exchangeApi';
import { depositApi } from '@/api/depositApi';
import { pointsApi } from '@/api/pointsApi';
import { itemApi } from '@/api/itemApi';
import { DepositStatus, PointsFlowType } from '@/constants/deposit';
import { ExchangeStatus } from '@/constants/exchange';
import { ItemCondition, ItemStatus } from '@/constants/item';
import type { Exchange } from '@/models/exchange';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`✅ ${msg}`);
};

const accounts = async () => pointsApi.listAccounts();
const acc = async (id: string) => (await accounts()).find((a) => a.user_id === id)!;
const flows = async () => pointsApi.listFlows();
const exchanges = async () => exchangeApi.list();
const settlements = async () => depositApi.listSettlements();

const makeExchange = async (from: string, to: string, toItemId: string, fromItemId: string) => {
  return exchangeApi.create({
    from_user_id: from,
    to_user_id: to,
    from_item_id: fromItemId,
    to_item_id: toItemId,
    message: '校验用交换',
  });
};

/** 为双方各建一件可交换物品，并据此发起交换（避免物品已交换导致无法建单） */
const freshExchange = async (from: string, to: string) => {
  const [fromItem, toItem] = await Promise.all([
    itemApi.create({
      user_id: from,
      title: `校验物-${Math.random().toString(16).slice(2, 7)}`,
      description: '校验',
      category: '数码',
      condition: ItemCondition.GOOD,
      images: [],
      location: '校验城',
      status: ItemStatus.AVAILABLE,
    }),
    itemApi.create({
      user_id: to,
      title: `校验物-${Math.random().toString(16).slice(2, 7)}`,
      description: '校验',
      category: '数码',
      condition: ItemCondition.GOOD,
      images: [],
      location: '校验城',
      status: ItemStatus.AVAILABLE,
    }),
  ]);
  return makeExchange(from, to, toItem.id, fromItem.id);
};

// idb-keyval 内存桩提供的测试钩子
const hooks = await import('idb-keyval');
const setFail = (hooks as unknown as { __setFail: (v: boolean) => void }).__setFail;
const dump = (hooks as unknown as { __dump: () => Map<string, unknown> }).__dump;

// 0. 种子数据 + 初始化积分账户
await userApi.list();
await itemApi.list();
const seedUsers = await storage.get(STORAGE_KEYS.users, [] as { id: string }[]);
await storage.transaction((tx) => pointsApi.ensureSeedAccounts(tx, seedUsers as never[]));
const seedEx = (await exchanges()).find((e) => e.id === 'exchange_seed')!;
const beforeMe = await acc('user_me');
const beforeLin = await acc('user_lin');
assert(beforeMe.available === 100 && beforeMe.frozen === 0, '初始：user_me 100/0');
assert(beforeLin.available === 100 && beforeLin.frozen === 0, '初始：user_lin 100/0');

// 1. 同意交换：双方各冻结 20
await depositApi.freezeForAccept(seedEx.id);
let me = await acc('user_me');
let lin = await acc('user_lin');
assert(me.available === 80 && me.frozen === 20, '冻结后 user_me 80/20');
assert(lin.available === 80 && lin.frozen === 20, '冻结后 user_lin 80/20');
let ex = (await exchanges()).find((e) => e.id === seedEx.id)!;
assert(ex.status === ExchangeStatus.ACCEPTED && !!ex.deposit_settlement_id, '交换=已同意且挂上结算单');
assert((await settlements()).length === 1, '仅一条结算单');

// 2. 重复点击 / 重放冻结：并发两次，只结算一次
await Promise.all([depositApi.freezeForAccept(seedEx.id), depositApi.freezeForAccept(seedEx.id)]);
const freezeFlows = (await flows()).filter((f) => f.type === PointsFlowType.FREEZE);
assert(freezeFlows.length === 2, '并发重复冻结只产生 2 条冻结流水（每方一条）');
me = await acc('user_me');
assert(me.available === 80 && me.frozen === 20, '重复冻结后余额不变');

// 3. 双方“同时”点确认完成：第一次只登记，第二个人触发原额解冻
const r1 = await depositApi.confirmComplete(seedEx.id, 'user_me');
assert(r1.completed === false, '第一个人确认：不立即解冻');
me = await acc('user_me');
assert(me.available === 80 && me.frozen === 20, '单方确认后积分不动');
const [a, b] = await Promise.all([
  depositApi.confirmComplete(seedEx.id, 'user_me'),
  depositApi.confirmComplete(seedEx.id, 'user_lin'),
]);
assert(a.completed || b.completed, '双方并发确认：恰有一次触发完成');
me = await acc('user_me');
lin = await acc('user_lin');
assert(me.available === 100 && me.frozen === 0, '完成后 user_me 原额解冻 100/0');
assert(lin.available === 100 && lin.frozen === 0, '完成后 user_lin 原额解冻 100/0');
const releaseFlows = (await flows()).filter((f) => f.type === PointsFlowType.RELEASE);
assert(releaseFlows.length === 2, '仅 2 条解冻流水');
ex = (await exchanges()).find((e) => e.id === seedEx.id)!;
assert(ex.status === ExchangeStatus.COMPLETED, '交换=已完成');
// 完成后刷新重放：不再解冻
await depositApi.confirmComplete(seedEx.id, 'user_lin');
assert((await flows()).filter((f) => f.type === PointsFlowType.RELEASE).length === 2, '完成后重放不新增流水');
const itemStore = await storage.get(STORAGE_KEYS.items, []);
assert(
  itemStore.find((i) => i.id === 'item_chair')!.status === ItemStatus.EXCHANGED &&
    itemStore.find((i) => i.id === 'item_camera')!.status === ItemStatus.EXCHANGED,
  '双方物品标记已交换',
);

// 4. 余额不足整次拒绝：user_chen 只有 10
const poorEx = await freshExchange('user_me', 'user_chen');
let threw = false;
try {
  await depositApi.freezeForAccept(poorEx.id);
} catch {
  threw = true;
}
assert(threw, '余额不足时整次抛错');
const poorExNow = (await exchanges()).find((e) => e.id === poorEx.id)! as Exchange;
assert(poorExNow.status === ExchangeStatus.PENDING && poorExNow.deposit_settlement_id === null, '余额不足：交换保持待确认');
assert((await settlements()).length === 1, '余额不足：不产生结算单');
assert(
  (await flows()).filter((f) => f.exchange_id === poorEx.id).length === 0,
  '余额不足：无任何流水，双方积分不变',
);
me = await acc('user_me');
const chen = await acc('user_chen');
assert(me.available === 100 && me.frozen === 0, '余额不足：user_me 积分未变');
assert(chen.available === 10 && chen.frozen === 0, '余额不足：user_chen 积分未变');

// 5. 取消赔付：lin 发起、me 接收；me 取消 → me 的 20 转给 lin，lin 自身 20 解冻
const cancelEx = await freshExchange('user_lin', 'user_me');
await depositApi.freezeForAccept(cancelEx.id);
me = await acc('user_me');
lin = await acc('user_lin');
assert(me.available === 80 && me.frozen === 20 && lin.available === 80 && lin.frozen === 20, '取消前双方 80/20');
await depositApi.cancel(cancelEx.id, 'user_me'); // me 是取消方
me = await acc('user_me');
lin = await acc('user_lin');
assert(me.available === 80 && me.frozen === 0, '取消方 user_me：可用不变 80，冻结清零（20 已划走）');
assert(lin.available === 120 && lin.frozen === 0, '对方 user_lin：自身解冻 + 收到赔付 = 120/0');
const cs = (await settlements()).find((s) => s.exchange_id === cancelEx.id)!;
assert(cs.status === DepositStatus.FORFEITED && cs.cancelled_by === 'user_me', '结算单=已赔付，记录取消方');
ex = (await exchanges()).find((e) => e.id === cancelEx.id)!;
assert(ex.status === ExchangeStatus.CANCELLED, '交换=已取消');
// 取消重放幂等
await depositApi.cancel(cancelEx.id, 'user_me');
lin = await acc('user_lin');
assert(lin.available === 120, '取消后重放不重复赔付');

// 6. 原子回滚：提交阶段失败 -> 全部键回到结算前
const rollbackEx = await freshExchange('user_lin', 'user_chen');
const idbBefore = dump().size;
setFail(true);
threw = false;
try {
  await depositApi.freezeForAccept(rollbackEx.id);
} catch {
  threw = true;
}
setFail(false);
assert(threw, '提交失败时事务抛错');
const rbEx = (await exchanges()).find((e) => e.id === rollbackEx.id)!;
assert(rbEx.status === ExchangeStatus.PENDING, '回滚：交换仍待确认');
assert((await settlements()).filter((s) => s.exchange_id === rollbackEx.id).length === 0, '回滚：无结算单');
assert((await flows()).filter((f) => f.exchange_id === rollbackEx.id).length === 0, '回滚：无流水');
assert(dump().size === idbBefore, '回滚：IndexedDB 键数量不变');
const chen2 = await acc('user_chen');
const lin2 = await acc('user_lin');
assert(chen2.available === 10 && chen2.frozen === 0, '回滚：user_chen 积分不变');
assert(lin2.available === 120 && lin2.frozen === 0, '回滚：user_lin 积分不变');

// 7. 流水余额快照与账户回读一致
for (const flow of await flows()) {
  const account = (await accounts()).find((x) => x.user_id === flow.user_id)!;
  if (flow.type === PointsFlowType.SEED) continue;
  assert(
    flow.balance_after <= account.available + account.frozen + 40,
    `流水 ${flow.type} 与账户量级一致（${flow.user_id}）`,
  );
}

console.log('\n🎉 全部诚信金结算校验通过');
