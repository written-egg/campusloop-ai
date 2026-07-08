# CampusLoop 融合后开发计划

## 1. 基础选择

后续开发仍以当前根目录 CampusLoop 网站为主基础，不切换到压缩包中的 Next.js + Supabase 项目，也不切换到 `vue3_trade_backend`。

原因：

- 当前网站已经包含 AI 估价、真伪识别、发布商品、语义搜索和轻量登录流程。
- 现有 API 路径适合按原规划逐步接入 SQL Server。
- 数据库课程设计重点是把 `data/db.json` 升级为 SQL Server，而不是重做技术栈。

## 2. 已融合内容

本次从压缩包中选择性融合了适合当前项目的内容：

- 复制 8 张真实商品图到 `public/assets/products/`。
- 扩充 `data/sample-products.json`，替换为更完整的精选二手商品样例。
- 同步更新 `data/db.json`，让当前网站启动后直接展示新商品。
- 增强首页和商品卡片，展示原价折扣、信用分、卖家校区、商品描述等信息。

未融合内容：

- 不引入 `.env`、`.git`、`.next`、Supabase 配置和 Next.js 运行代码。
- 不改变当前 Node.js + 静态前端的主结构。

## 3. 调整后的阶段计划

### 阶段 0：展示层融合

完成标准：

- 首页商品更真实，图片来自本地资源。
- 商品卡片能展示卖家、校区、信用、成色、折扣和描述。
- 当前网站仍可通过 `node server.js` 运行。

### 阶段 1：SQL Server 数据库脚本

新增 `database/schema.sql`，包含：

- `Users`
- `Categories`
- `Products`
- `Transactions`
- `Favorites`
- `Messages`
- `AIReports`
- `RiskLogs`

同时加入主外键、CHECK 约束、索引、视图、存储过程和触发器。

### 阶段 2：初始化数据

新增 `database/seed.js`：

- 从 `data/sample-products.json` 导入商品。
- 从 `data/db.json` 导入已有用户和演示商品。
- 重复执行时避免重复插入。

### 阶段 3：连接层与仓储层

新增：

- `lib/db.js`
- `lib/repositories/users.js`
- `lib/repositories/products.js`
- `lib/repositories/aiReports.js`
- `lib/repositories/riskLogs.js`

通过 `mssql` 连接本地 SQL Server。

### 阶段 4：接口替换

保持前端调用路径不变，只替换接口内部数据来源：

- `GET /api/users`
- `POST /api/users`
- `GET /api/products`
- `POST /api/products`
- `POST /api/generate-listing`
- `POST /api/search-intent`
- `POST /api/customer-service`

成功返回格式继续保持：

```json
{ "ok": true, "data": {}, "error": null }
```

### 阶段 5：AI 与风控落库

- AI 发布文案、语义搜索、智能客服结果写入 `AIReports`。
- 商品发布时的异常价格、新账号、敏感词等写入 `RiskLogs`。
- 页面先保持当前展示方式，数据库记录用于答辩展示。

### 阶段 6：答辩材料

整理：

- ER 图
- 关系模式
- 典型 SQL 查询
- 视图、存储过程、触发器截图
- 网站操作引起数据库变化的测试记录

## 4. 压缩包后续用途

压缩包只作为参考库：

- 可继续参考商品详情页、发布流程、卖家管理页面的 UI。
- 可继续复用合适的静态图片和文案。
- 不作为数据库系统基础。

## 5. 当前推荐下一步

下一步进入阶段 1：编写 `database/schema.sql`。

优先实现 8 张核心表和数据库高级对象，然后再接入 `mssql`，这样最符合数据库课程设计的评分重点。
