# CampusLoop AI 校园二手交易平台

CampusLoop 是一个使用 Node.js、原生 Web 前端、SQL Server 和 DeepSeek 构建的校园二手交易系统。当前版本已覆盖用户、商品、交易、社交、AI 辅助、风险审核和管理员操作，可用于本地开发、课程演示和数据库系统验收。

## 已实现功能

### 普通用户

- 注册、登录、退出登录和会话校验
- 编辑个人资料、修改密码和注销账号
- 发布商品、保存商品图片、编辑商品和主动下架
- 查看自己的在售、预订、售出和下架商品
- 浏览商品详情、条件筛选和精准搜索
- 收藏商品、联系买卖双方和查看站内消息
- 查看 AI 估价、真伪风险评估和历史记录

### 交易流程

- 买家预订商品并生成交易记录
- 卖家确认预订和确认交易完成
- 买卖双方取消符合条件的交易
- 已确认交易可以发起争议并填写原因
- 防止重复操作、越权操作和无效状态变更
- 商品状态与交易状态自动同步

### 管理员

- 查看平台数据概览
- 查询、禁用和恢复用户
- 查询、下架和恢复商品
- 审核异常价格、站外交易、新账号高价商品和 AI 验真风险
- 查看管理员操作日志

## 技术组成

- 前端：HTML、CSS、原生 JavaScript
- 后端：Node.js HTTP 服务
- 数据库：SQL Server / SQL Server Express
- AI：DeepSeek API，未配置密钥时使用本地回退结果
- 密码：bcrypt 单向哈希
- 身份认证：Bearer 会话令牌

## 首次运行

### 1. 环境要求

- Node.js 18 或更高版本
- SQL Server 或 SQL Server Express
- SQL Server Management Studio（推荐）

### 2. 安装依赖

在项目目录打开 PowerShell：

```powershell
npm install
```

### 3. 创建数据库

仅在第一次创建 `CampusLoopDB` 时，依次在 SSMS 中执行：

1. `database/schema.sql`
2. `database/seed.sql`
3. `database/verify.sql`

`schema.sql` 会删除并重建同名业务表。已有数据库不要重复执行它，应使用后面的迁移命令。

### 4. 创建本地配置

复制 `.env.example` 为 `.env`，填写自己的本地配置：

```dotenv
PORT=5173

DB_SERVER=localhost
DB_PORT=1433
DB_NAME=CampusLoopDB
DB_USER=sa
DB_PASSWORD=你的本地数据库密码
DB_ENCRYPT=false
DB_TRUST_CERT=true

DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_MODEL=deepseek-chat
```

- `.env` 已被 Git 忽略，不会提交到 GitHub。
- 不使用 DeepSeek 时可以不填写 `DEEPSEEK_API_KEY`。
- 推荐后续通过 `database/create-dev-login.sql` 创建专用数据库账号，减少长期使用 `sa` 的风险。

### 5. 检查数据库连接

```powershell
npm run check:sql
```

输出包含 `"storage": "sql-server"` 即表示网站会读写 SQL Server。

### 6. 启动网站

```powershell
npm start
```

浏览器打开：<http://localhost:5173>

以后日常运行只需要进入项目目录后执行 `npm start`，不需要重复建库或重复设置 PowerShell 环境变量。

## 已有数据库升级

从旧版本升级时不要重新执行 `schema.sql`。先备份数据库，再按顺序执行尚未应用的迁移：

```powershell
npm run migrate:auth
npm run migrate:product-description
npm run migrate:admin
npm run migrate:account
npm run migrate:transactions
npm run migrate:risks
```

迁移分别增加登录认证、商品描述、管理员审核、账户管理、完整交易状态和真实风险记录。迁移脚本位于 `database/migrations/`。

## 功能检查

### 自动检查

网站启动后可分别运行：

```powershell
npm run check:sql
npm run check:auth-db
npm run check:auth-api
npm run check:advanced-db
npm run check:search
npm run check:marketplace-api
npm run check:social-ai-api
npm run check:account-api
npm run check:admin-api
npm run check:risks
```

这些检查会验证数据库、注册登录、搜索、商品权限、交易流程、收藏消息、AI 记录、账户设置、管理员审核和真实风险日志。

### 人工验收流程

1. 注册卖家账号并发布商品。
2. 注册另一个买家账号，收藏并预订该商品。
3. 切回卖家，在“我的交易”中确认预订。
4. 完成交易，或由任一方取消、发起争议。
5. 使用管理员账号进入管理后台，查看商品、风险和操作日志。
6. 在 SSMS 中检查 `Users`、`Products`、`ProductImages`、`Transactions` 和 `RiskLogs`。

## 风险记录规则

系统不再生成 `seed-demo` 演示风险。以下业务行为会产生真实 `RiskLogs`：

- 售价低于原价 50%
- 商品描述包含微信、QQ、支付宝或线下转账等站外交易提示
- 注册未满 7 天的账号发布 3000 元以上商品
- AI 真伪识别返回中风险或高风险

管理员可以把风险标记为确认风险、误报或已处理。

## AI 使用说明

配置 `DEEPSEEK_API_KEY` 并重启网站后，AI 估价、真伪风险评估和文案生成会优先调用 DeepSeek。页面结果会显示 `DeepSeek AI`；调用失败或未配置密钥时显示本地模型。

密钥只保存在服务端 `.env`，不要写进前端代码、截图、文档或 GitHub。

## 两人 GitHub 开发流程

1. A、B 都从最新 `dev` 创建自己的功能分支。
2. 每个人只提交与自己任务相关的文件，不提交 `.env`、数据库密码、临时截图和无关文档。
3. 开发完成后先在功能分支运行对应检查。
4. 推送功能分支并创建目标为 `dev` 的 Pull Request。
5. A 审核、处理冲突并合并到 `dev`。
6. `dev` 完整验收通过后，再创建 Pull Request 合并到 `main`。

开始新任务时同步代码：

```powershell
git switch dev
git pull origin dev
git switch -c feature/任务名称
```

## 主要目录

```text
public/                 网页、样式和浏览器交互
server.js               Node.js 服务和接口路由
lib/sqlStore.js         SQL Server 数据访问与业务权限
database/schema.sql     全新建库脚本
database/seed.sql       初始展示数据
database/migrations/    非破坏性升级脚本
database/verify.sql     数据库验收查询
tools/                  自动化检查工具
docs/                   开发交接与测试报告
data/                   本地回退数据和 AI 规则数据
```

## 常见问题

### `npm` 找不到 `package.json`

先进入项目目录，再运行命令：

```powershell
cd "D:\33059\Documents\note\value\Subject\通识\电子商务概论\AI二手网站"
```

### SQL Server 连接 15 秒超时

确认 SQL Server 服务已启动、TCP/IP 已启用，并监听 1433 端口。使用当前项目推荐配置：

```dotenv
DB_SERVER=localhost
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_CERT=true
```

### 网页仍显示旧内容

停止旧服务后重新运行 `npm start`，再使用 `Ctrl+F5` 强制刷新浏览器。

### 为什么不能从 PasswordHash 得到原密码

密码使用 bcrypt 单向哈希保存，不能反向转换。忘记测试账号密码时只能设置一个新密码。

## 部署说明

当前完整版本依赖 SQL Server，正式部署必须同时提供可从服务器访问的 SQL Server 和对应环境变量。仅部署静态网页或使用临时内存数据不适合长期保存注册、商品和交易信息。

更详细的云端说明见 `国内部署说明.md`。
