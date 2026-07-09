# CampusLoop AI 校园二手市场

这是一个课程展示级的最小可运行二手电商 AI 平台。项目参考校园二手交易平台的商品、分类、用户、发布和搜索流程，但用更轻量的 Node.js 服务实现，重点展示 AI 发布、智能估价、真伪识别和语义匹配。

## 功能

- AI 智能发布：上传商品图、填写简单描述，生成标题与描述。
- 基础 AI 估价：L1 品类参数库 + L2 近期成交价拟合。
- 真伪识别：结合品类、型号、报价、序列号和描述生成可信度与验货建议。
- 语义搜索：自然语言需求转搜索意图并匹配商品。
- 数据库存储：本地默认使用 `data/db.json`；配置 `DB_USER` 和 `DB_PASSWORD` 后自动切换到 SQL Server。
- 安全信任：敏感词、异常价格、新账号风险提示，API Key 不进入前端。

## 运行

```bash
node server.js
```

然后打开：

```text
http://localhost:5173
```

## SQL Server 本地接入

先确认 `CampusLoopDB` 已执行 `database/schema.sql` 和 `database/seed.sql`。不要把数据库密码写进代码或提交到 GitHub。

推荐创建专用开发账号，不要长期使用 `sa`：

```powershell
sqlcmd -S .\SQLEXPRESS -U sa -P $env:SQL_TEST_PASSWORD -C -v CampusLoopPassword="你自己设置的新密码" -i "database\create-dev-login.sql"
```

然后在本地 PowerShell 中临时配置网站数据库连接：

```powershell
$env:DB_SERVER=".\SQLEXPRESS"
$env:DB_NAME="CampusLoopDB"
$env:DB_USER="campusloop_dev"
$env:DB_PASSWORD="你自己设置的新密码"
$env:DB_ENCRYPT="false"
$env:DB_TRUST_CERT="true"
```

检查 Node.js 是否能读取 SQL Server：

```powershell
npm run check:sql
```

启动网站：

```powershell
npm start
```

配置数据库环境变量后，`GET/POST /api/users` 和 `GET/POST /api/products` 会读写 SQL Server；未配置时继续使用 `data/db.json`，方便没有数据库环境的同学打开网站。

## DeepSeek 接入

当前可以不配置 API Key，系统会自动使用本地回退逻辑。

需要接入真实 DeepSeek 时，设置环境变量后重启：

```bash
set DEEPSEEK_API_KEY=你的Key
set DEEPSEEK_MODEL=deepseek-chat
node server.js
```

服务端接口：

- `POST /api/generate-listing`
- `POST /api/extract-attributes`
- `POST /api/search-intent`
- `POST /api/customer-service`
- `GET /api/products`
- `POST /api/products`
- `GET /api/users`
- `POST /api/users`

数据库文件：

- `data/db.json`

SQL Server 后续开发文件：

- `database/schema.sql`：SQL Server 建库建表脚本。
- `database/seed.sql`：当前网站示例数据的初始化脚本。
- `database/verify.sql`：数据库验收查询脚本。
- `database/create-dev-login.sql`：创建 `campusloop_dev` 本地开发账号。
- `database/README.md`：执行顺序、字段映射和第一天验收方式。

普通用户页面不开放数据库管理模块；用户只通过发布、保存商品、浏览商品和搜索匹配间接使用数据库。

## Render 部署

推荐用 Render Web Service 部署当前项目：

- Build Command：留空或 `npm install`
- Start Command：`npm start`
- Environment Variables：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_MODEL=deepseek-chat`

Render 会自动注入 `PORT`，服务端已兼容。

## Vercel 部署

如果 Render 注册或 CAPTCHA 不可用，可以直接用 Vercel 连接 GitHub 仓库部署。

- Framework Preset：Other
- Build Command：留空
- Output Directory：留空
- Install Command：留空或 `npm install`
- Environment Variables：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_MODEL=deepseek-chat`

Vercel 部署使用 `api/index.js` 作为 Serverless API。云端演示环境里的用户/商品新增数据使用内存存储，适合课程展示；如果要长期保存数据，需要接入云数据库。

## 数据文件

- `data/category-knowledge.json`
- `data/market-transactions.json`
- `data/sample-products.json`
- `data/risk-rules.json`
