# B 成员今日接口与页面联调测试记录

测试日期：2026-07-09  
测试分支：`feature/ui-api-test`  
测试基线：从 `dev` 创建本地 `feature/ui-api-test`。A 的数据库分支 `feature/db-schema` 已存在，但未合并进 `dev`，本次 B 成员联调不修改 A 负责的数据库文件。

## 测试环境

- 启动命令：`npm install`、`npm start`
- 访问地址：`http://localhost:5173`
- SQL Server：未配置
- 数据源：当前 `dev` 版本按 `server.js` 读写 `data/db.json`；若后续合入 A 分支，接口返回 `storage: "json"` 也属于正常情况
- 浏览器控制台：页面流程验证期间未发现 error 级别日志

## 接口联调结果

| 测试项 | 操作 | 结果 |
| --- | --- | --- |
| 商品列表 | `GET /api/products` | 通过；返回 `ok: true` 和商品数组 |
| 用户列表 | `GET /api/users` | 通过；返回 `ok: true` 和用户数组 |
| 注册用户 | `POST /api/users`，提交昵称和校区 | 通过；返回用户对象，并可通过 `GET /api/users` 查回 |
| 发布商品 | `POST /api/products`，提交商品、卖家和校区字段 | 通过；返回商品对象，并可通过 `GET /api/products` 查回 |
| AI 发布 | `POST /api/generate-listing` | 通过；无 API Key 时返回 `local-fallback` 文案 |
| 语义搜索 | `POST /api/search-intent` | 通过；无 API Key 时返回 `local-fallback`，能识别运动户外意图 |
| 智能客服 | `POST /api/customer-service` | 通过；无 API Key 时返回 `local-fallback` 安全交易建议 |

本次接口验证中的临时测试用户和测试商品已从 `data/db.json` 清理，不作为提交内容。

## 页面验证结果

| 页面流程 | 结果 |
| --- | --- |
| 首页商品列表 | 通过；商品卡片正常展示名称、分类、价格、原价折扣、成色、标签、信用、浏览量、卖家、校区和图片 |
| 登录表单 | 通过；页面调用 `POST /api/users`，成功后展示“用户已由后端接口创建或复用” |
| AI 发布文案 | 通过；发布页可生成标题、描述、估价和风控提示 |
| 发布商品 | 通过；成功后页面会复查 `GET /api/products`，明确提示已写入 `data/db.json`，刷新后仍可见 |
| 发布失败提示 | 已增强；接口失败时只保存为本机临时商品，并提示“换设备不可见” |
| 搜索页 | 通过；语义搜索可渲染意图标签和匹配结果 |

## 截图清单

- `docs/screenshots/01-market-list.png`：首页商品列表
- `docs/screenshots/02-login-success.png`：登录成功与当前用户
- `docs/screenshots/03-publish-form.png`：发布表单填写状态
- `docs/screenshots/04-ai-listing.png`：AI 发布文案生成结果
- `docs/screenshots/05-publish-after-refresh.png`：发布后刷新仍可见
- `docs/screenshots/06-search-results.png`：语义搜索结果

说明：应用内浏览器安全策略拦截了直接打开 `/api/products` JSON 地址，因此接口证据记录在本报告的接口联调结果中，而非单独截图。

## 今日结论

B 成员今日负责的页面与接口联调任务通过：商品列表、注册用户、发布商品、刷新持久化、AI 发布、语义搜索、智能客服均可在未配置 SQL Server 的本地环境下正常运行。当前 `dev` 版本使用 `data/db.json` 作为本地持久化数据源。

## 合并注意事项

- 本分支按交接说明从 `dev` 创建，只包含 B 的 `public/app.js` 和 `docs/` 变更。
- A 的 `feature/db-schema` 后续可按团队顺序先合并到 `dev`；B 分支 PR 时如有冲突，再基于最新 `dev` 处理。
- 不要把真实 `.env`、数据库密码或临时测试数据提交到 GitHub。
