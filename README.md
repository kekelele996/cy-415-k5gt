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
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成。
- **交换诚信金结算**：同意交换时双方各冻结 20 点平台积分，余额不足整次拒绝；双方确认完成后原额解冻；任一方取消时其冻结份额赔付给对方。冻结/解冻/赔付与交换状态一次原子持久化，每笔交换只结算一次。
- 个人中心，编辑资料、上传头像、查看我发布的物品。
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
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts, pointsApi.ts, depositApi.ts：本地数据 API 层
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, pointsStore.ts, depositStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts, points.ts：独立数据模型
├── types/            # 共享类型补充
├── components/common/# 共享业务组件（含 PointsWallet、PointsLedger）和 GlobalErrorBoundary
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts（含原子事务）, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, deposit.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css

scripts/
├── settlement-check.ts          # 诚信金结算端到端校验
├── run-settlement-check.mjs     # 校验运行器（esbuild + 内存存储桩）
└── idb-keyval.stub.mjs          # idb-keyval 内存桩（保持 setMany 单事务语义）
```

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理，以及多键原子事务 `storage.transaction()`。
- 首次启动会写入演示用户、物品和交换请求；积分账户（user_me/user_lin 各 100 点，user_chen 10 点）首次水合时建立。

## 交换诚信金结算规则

每方冻结固定 `DEPOSIT_AMOUNT = 20` 点平台积分：

- **同意（冻结）**：双方可用余额各 ≥ 20 才能同意，各冻结 20（可用 -20、冻结 +20）；任一方余额不足 → 整次拒绝，交换保持「待确认」，不产生任何流水与结算单。
- **完成（原额解冻）**：双方都点击「确认完成」后，各自冻结的 20 原额解冻（可用 +20、冻结 -20），交换置「已完成」、双方物品置「已交换」。仅一方确认时只登记进度，不动积分。
- **取消（赔付）**：已冻结阶段任一方可取消。取消方冻结的 20 转给对方（对方可用 +20），对方自身冻结的 20 原额解冻（对方净 +40、冻结清零）；取消方可用不变、冻结清零；交换置「已取消」。

### 原子性与幂等

- **一次持久化**：冻结/解冻/赔付流水、积分账户、诚信金结算单、交换状态（含完成时的物品状态）都在 `storage.transaction()` 内完成，经 IndexedDB 单事务（idb-keyval `setMany`）多键一次提交；事务体内任一步抛错或提交失败，所有键都不落盘，全部回到结算前。事务由内存 Promise 互斥队列串行执行。
- **只结算一次**：每笔交换对应唯一结算单（id 由交换 id 派生），流水带业务幂等键（`freeze/release/compensate/forfeit:<exchange>:<user>`）；重复点击（store 进行中锁 + 按钮禁用）、双方同时操作（事务串行 + 结算单状态守卫）、刷新重放（幂等键去重 + 终态直接回显）都不会重复结算。
- **回读一致**：每次结算提交成功后强制回读交换、物品、积分账户与流水，页面余额与流水快照（`balance_after`/`frozen_after`）保持一致。
- 校验脚本：`pnpm check:settlement`（覆盖冻结、双确认、并发、取消赔付、余额不足整拒、提交失败全回滚、重放幂等等 40+ 断言）。

## 新增/改动文件（诚信金）

- 常量：`constants/deposit.ts`（`DepositStatus`、`PointsFlowType`、`DEPOSIT_AMOUNT`）；`constants/exchange.ts` 新增 `CANCELLED`。
- 模型：`models/points.ts`（`PointsAccount`、`PointsFlow`、`DepositSettlement`）；`models/exchange.ts` 新增 `deposit_settlement_id`。
- API：`api/pointsApi.ts`、`api/depositApi.ts`；`utils/storage.ts` 增加 `transaction()` 及三个存储键。
- Store：`stores/pointsStore.ts`、`stores/depositStore.ts`；`stores/exchangeStore.ts` 接入结算。
- 组件：`components/common/PointsWallet.vue`、`PointsLedger.vue`；`ExchangeCard.vue` 展示诚信金与确认进度并新增取消。
- 页面：`pages/Exchanges.vue`、`pages/Profile.vue`；`utils/formatters.ts`、`constants/messages.ts`、`hooks/useExchangeStats.ts`、`router/guards.ts` 同步。

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

定义位置：`src/constants/exchange.ts`（PENDING / ACCEPTED / REJECTED / COMPLETED / **CANCELLED**）

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/api/depositApi.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`

### DepositStatus / PointsFlowType（诚信金结算）

定义位置：`src/constants/deposit.ts`

出现位置：

- `src/models/points.ts`
- `src/api/pointsApi.ts`
- `src/api/depositApi.ts`
- `src/stores/pointsStore.ts`
- `src/stores/exchangeStore.ts`
- `src/utils/formatters.ts`
- `src/components/common/ExchangeCard.vue`
- `src/components/common/PointsLedger.vue`

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
