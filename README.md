# CampusLoop AI 校园二手市场

这是一个课程展示级的最小可运行二手电商 AI 平台。项目参考校园二手交易平台的商品、分类、用户、发布和搜索流程，但用更轻量的 Node.js 服务实现，重点展示 AI 发布、智能估价、真伪识别和语义匹配。

## 功能

- AI 智能发布：上传商品图、填写简单描述，生成标题与描述。
- 基础 AI 估价：L1 品类参数库 + L2 近期成交价拟合。
- 真伪识别：结合品类、型号、报价、序列号和描述生成可信度与验货建议。
- 语义搜索：自然语言需求转搜索意图并匹配商品。
- 数据库存储：后端使用 `data/db.json` 持久化用户和商品信息。
- 安全信任：敏感词、异常价格、新账号风险提示，API Key 不进入前端。

## 运行

```bash
node server.js
```

然后打开：

```text
http://localhost:5173
```

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

普通用户页面不开放数据库管理模块；用户只通过发布、保存商品、浏览商品和搜索匹配间接使用数据库。

## Render 部署

推荐用 Render Web Service 部署当前项目：

- Build Command：留空或 `npm install`
- Start Command：`npm start`
- Environment Variables：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_MODEL=deepseek-chat`

Render 会自动注入 `PORT`，服务端已兼容。

## 数据文件

- `data/category-knowledge.json`
- `data/market-transactions.json`
- `data/sample-products.json`
- `data/risk-rules.json`
