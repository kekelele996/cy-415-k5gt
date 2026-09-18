# ReSwap 二手闲置物品交换平台

```bash
pnpm install
pnpm dev
```

访问地址：`http://localhost:18415`

## 项目介绍

ReSwap 是一个纯前端以物换物 Web 应用。用户可以本地模拟登录、发布闲置物品、浏览他人物品、发起交换请求，并在浏览器内管理交换记录。

## 主要功能

- 首页瀑布流浏览、分类筛选、关键词搜索。
- 物品详情、物主资料、选择自己的物品发起交换。
- 发布物品，支持本地 base64 图片上传、分类和成色选择。
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成、取消。
- **交换诚信金结算**：同意交换时双方各冻结 20 点平台积分，余额不足整次拒绝；双方确认完成后原额解冻，任一方取消时仅取消方冻结份额赔付给对方。冻结、解冻、赔付与交换状态在同一事务内一次持久化，任一步失败全部回滚；重复点击、双方同时操作、刷新重放均保证每笔交换只结算一次。
- 个人中心，编辑资料、上传头像、查看我发布的物品、查看平台积分余额与余额流水。
- 主题切换、全局错误处理和 Vant 提示。

## 启动与构建

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

生产部署：执行 `pnpm build` 后，将 `dist/` 目录交给 Nginx 或任意静态文件服务器托管。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI | Vant + Tailwind CSS |
| 持久化 | localStorage + IndexedDB（idb-keyval） |
| 工具库 | dayjs、lodash-es |

## 项目目录结构

```text
src/
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts, walletApi.ts, settlementApi.ts：本地数据 API 层
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, settlementStore.ts, walletStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts, point.ts, settlement.ts：独立数据模型
├── types/            # 共享类型补充（含事务快照 TransactionSnapshot）
├── components/common/# 共享业务组件和 GlobalErrorBoundary（含 PointWalletPanel）
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts（含原子事务 txn）, ledger.ts（积分台账）, withLock.ts（结算互斥锁）, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, point.ts, settlement.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css
```

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理。
- 首次启动会写入演示用户、物品、交换请求（含一条已同意交换）和积分账户。

### 诚信金结算的一致性保证

- **原子事务**：`storage.txn()` 在 producer 中读取快照、计算新值，提交阶段先全量写 localStorage，再全量写 IndexedDB；任一写入失败，所有键恢复到事务前的值。冻结流水、双方账户、结算记录、交换（及物品）状态属于同一事务，任一步失败全部回到结算前。
- **每交换唯一结算**：每笔交换在 `reswap:exchange-settlements` 中只有一条记录（`frozen → released / compensated` 单向状态机），同意/确认/取消的重放请求命中已有记录即直接回读，不产生第二次结算。
- **并发串行化**：`utils/withLock.ts` 用同标签页 Promise 链 + Web Locks API（跨标签页）把同一笔结算压成串行；store 内还有进行中操作标记吞掉重复点击。
- **页面与流水回读一致**：每次结算成功后 exchange / settlement / wallet / item store 统一重新从存储回读；积分流水记录 `balance_after` / `frozen_after`，个人中心「平台积分」面板逐笔可对。

## 横切关注点

- 主题切换：`stores/themeStore.ts`、`constants/themes.ts`、`utils/themeUtils.ts`、`App.vue`、`components/common/CategoryFilter.vue`、`components/common/UserBrief.vue`、`components/common/ItemCard.vue`。
- 全局错误处理/提示：`utils/message.ts`、`components/common/GlobalErrorBoundary.tsx`、`stores/authStore.ts`、`stores/itemStore.ts`、`stores/exchangeStore.ts`、`components/common/ImageUploader.vue`。

## 枚举出现位置清单

### ItemStatus

定义位置：`src/constants/item.ts`

出现位置：

- `src/models/item.ts`
- `src/constants/messages.ts`
- `src/api/itemApi.ts`
- `src/api/exchangeApi.ts`
- `src/stores/itemStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/components/common/ItemCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Publish.vue`
- `src/pages/Profile.vue`

### ExchangeStatus

定义位置：`src/constants/exchange.ts`

值：`PENDING / ACCEPTED / REJECTED / COMPLETED / CANCELLED`（`CANCELLED` 为诚信金取消赔付后的交换状态）

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/api/settlementApi.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`

### SettlementStatus / PointEntryType

- `SettlementStatus`（`FROZEN / RELEASED / COMPENSATED`）定义于 `src/constants/settlement.ts`，出现于 `models/settlement.ts`、`api/settlementApi.ts`、`stores/exchangeStore.ts`、`components/common/ExchangeCard.vue`、`utils/formatters.ts`、`constants/messages.ts`。
- `PointEntryType`（`FREEZE / UNFREEZE / FORFEIT / COMPENSATE`）定义于 `src/constants/point.ts`，出现于 `models/point.ts`、`utils/ledger.ts`、`utils/formatters.ts`、`constants/messages.ts`、`components/common/PointWalletPanel.vue`。

## 分层与高耦合约束

本项目保留提示词要求的“严禁合并职责到单一文件”：模型、常量、API、store、页面、组件、hooks、utils 均独立拆分。

同时保留“屎山代码设计要求”的低内聚高耦合特征：

- `utils/formatters.ts` 同时负责日期、物品状态、交换状态、成色、信用等级文本。
- `constants/messages.ts` 同时包含页面提示、表单校验、日志式文案和状态文案。
- `ItemStatus` 与 `ExchangeStatus` 被模型、API、store、组件、页面、router guards、formatters 多处引用。
- `utils/storage.ts` 是存储入口，但全应用 API 和 store 都依赖它的 key 与数据结构。

例如新增 `ItemStatus.BOOKED` 时，应至少修改：`src/constants/item.ts`、`src/models/item.ts`、`src/api/itemApi.ts`、`src/api/exchangeApi.ts`、`src/stores/itemStore.ts`、`src/router/guards.ts`、`src/utils/formatters.ts`、`src/constants/messages.ts`、`src/components/common/ItemCard.vue`、`src/pages/ItemDetail.vue`、`src/pages/Publish.vue` 等文件。

## 环境变量

当前项目无必需环境变量。

## License

MIT
