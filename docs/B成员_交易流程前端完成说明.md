# CampusLoop B 成员交易流程前端完成说明

## 1. 本次任务结论

B 成员已完成“我的交易”页面与 A 的交易流程接口联调。页面不在浏览器本地修改交易状态，所有状态变化均先调用交易接口，成功后重新获取交易列表、我的商品和公开商品列表。

本次工作基于最新 `dev` 的 A 后端提交 `34d19d3` 开展，开发分支为 `feature/transaction-workflow-ui`。

## 2. 修改文件

| 文件 | 修改内容 |
| --- | --- |
| `public/app.js` | 五种交易状态、买卖双方按钮权限、确认/完成/取消/争议操作、接口错误展示、操作后刷新 |
| `public/index.html` | 新增非原生争议弹框和用户可读的交易页说明，更新静态资源缓存版本 |
| `public/styles.css` | 已确认与争议状态样式、交易记录详情、争议原因、桌面和手机端布局 |
| `docs/screenshots/26-buyer-transactions.png` | 买家视角 |
| `docs/screenshots/27-seller-pending.png` | 卖家待确认视角 |
| `docs/screenshots/28-seller-confirmed.png` | 卖家确认后的待当面交易视角 |
| `docs/screenshots/29-transaction-disputed.png` | 争议状态、争议原因与发起时间 |
| `docs/screenshots/30-transaction-mobile.png` | 390 像素宽手机端布局 |

未修改 `server.js`、`lib/sqlStore.js`、`database/`、`package.json`、`package-lock.json`、后端测试脚本、`.env` 或 `data/db.json`。

## 3. 接入接口

页面继续使用登录会话中的 `sessionToken`，通过 `Authorization: Bearer <sessionToken>` 调用：

- `GET /api/my/transactions`
- `POST /api/transactions/:id/confirm`
- `POST /api/transactions/:id/finish`
- `POST /api/transactions/:id/cancel`
- `POST /api/transactions/:id/dispute`

接口失败时优先显示后端响应中的中文 `error`。遇到 `401` 会清理失效会话并返回登录页；遇到 `409` 会保留具体错误，并重新获取交易状态，避免页面继续显示过期按钮。

## 4. 页面状态与按钮验收

| 角色与状态 | 页面状态 | 可见操作 | 实际结果 |
| --- | --- | --- | --- |
| 买家 `pending` | 等待卖家确认 | 取消预订 | 通过 |
| 卖家 `pending` | 等待卖家确认 | 确认预订、取消交易 | 通过 |
| 买家 `confirmed` | 待当面交易 | 发起争议、取消交易 | 通过 |
| 卖家 `confirmed` | 待当面交易 | 完成交易、发起争议、取消交易 | 通过 |
| 双方 `finished` | 已完成 | 无 | 通过 |
| 双方 `cancelled` | 已取消 | 无 | 通过 |
| 双方 `disputed` | 争议处理中 | 无 | 通过 |

确认预订、完成交易和取消交易使用交接文档指定的确认文字。发起争议使用页面弹框，不使用浏览器原生 `prompt()`；原因不能为空，最多 500 个字符，并实时显示字数。

## 5. 联调实际结果

- 买家看不到“确认预订”和“完成交易”。
- 卖家确认 `pending` 后，页面立即刷新为“待当面交易”。
- 只有卖家能完成 `confirmed` 交易，完成后记录不再显示操作按钮。
- 买家和卖家都能取消 `pending`、`confirmed` 交易，取消后记录不再显示操作按钮。
- 买家和卖家都能对 `confirmed` 交易发起争议。
- 空争议原因会显示“请填写争议原因。”，不会发送请求。
- 争议成功后显示争议原因和发起时间，且不再显示操作按钮。
- 操作提交时会禁用该交易卡片内的全部按钮，防止重复点击。
- 每次成功操作后同时刷新交易列表、我的商品和公开商品列表。
- 390 像素宽手机端无横向滚动，按钮、状态和商品信息不重叠。

## 6. 已执行验证

| 验证 | 结果 |
| --- | --- |
| `node --check public/app.js` | 通过 |
| `git diff --check` | 通过；仅有 Windows 换行提示，无格式错误 |
| `npm run check:search` | 通过，5 项精准搜索检查全部为 `true` |
| `npm start` | 通过，服务启动于 `http://localhost:5173` |
| `GET /api/products` | 通过，返回 `ok: true`、商品列表和 `storage: "json"` |
| 桌面端买家/卖家流程模拟联调 | 通过 |
| 确认、完成、取消、争议及空原因模拟联调 | 通过 |
| 390 像素手机端检查 | 通过，页面宽度与滚动宽度均为 390 |

本机没有配置 SQL Server 账号，因此执行 `npm run check:marketplace-api` 时工具提示：

```text
SQL Server is not configured. Set DB_USER and DB_PASSWORD to enable it.
```

这表示自动化脚本未进入数据库测试阶段，不代表页面联调失败。A 已在交接文档中说明后端的 22 项交易检查通过；合并前请 A 在已配置 SQL Server 的环境再运行一次 `npm run check:marketplace-api`，完成真实数据库的最终回归。

## 7. A 的复核步骤

1. 切换到本 PR 分支并配置 A 的 SQL Server 环境。
2. 运行 `npm install`、`npm run migrate:transactions`、`npm run check:marketplace-api` 和 `npm start`。
3. 注册买家和卖家账号，由卖家发布商品，买家预订。
4. 分别登录买家和卖家账号，在“我的交易”中核对上方按钮矩阵。
5. 依次测试确认预订、完成交易、取消交易和发起争议。
6. 核对成功后交易状态、商品状态和刷新后的页面结果。

## 8. 遗留事项

前端模拟联调中未发现未解决的功能问题。唯一待 A 完成的是在真实 SQL Server 环境复跑交易自动化脚本；若接口字段或后端错误文案后续调整，再同步更新前端展示即可。
