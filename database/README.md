# CampusLoop SQL Server database

这个目录包含 CampusLoop 当前完整的 SQL Server 建库、初始化、升级和验收文件。网站配置数据库连接后，用户、商品、图片、交易、收藏、消息、AI 报告、风险记录和管理员日志都会写入 `CampusLoopDB`。

## 文件

- `schema.sql`：创建 `CampusLoopDB`，包含用户、分类、商品、图片、交易、收藏、消息、AI 结果和风控日志等核心表。
- `seed.sql`：导入网站初始用户、商品、封面图、收藏、消息和 AI 报告，不再生成演示风险记录。
- `verify.sql`：验证建库、种子数据和商品视图是否成功。
- `create-dev-login.sql`：创建本地开发账号 `campusloop_dev`，用于网站后端连接数据库。
- `migrations/002_auth_and_advanced_objects.sql`：登录字段、视图、存储过程和基础触发器。
- `migrations/003_product_description_view.sql`：商品描述字段和视图升级。
- `migrations/004_admin_moderation.sql`：管理员审核字段、索引和日志。
- `migrations/005_account_management.sql`：个人资料、密码修改和账号注销字段。
- `migrations/006_transaction_workflow.sql`：确认、完成、取消和争议交易状态。
- `migrations/007_real_risk_logs.sql`：删除演示风险，启用真实发布风控规则。
- `queries.sql`：课程答辩可直接执行的典型业务查询。

## 执行顺序

在 SQL Server Management Studio 或 Azure Data Studio 中依次执行：

```sql
:r database/schema.sql
:r database/seed.sql
```

如果工具不支持 `:r`，就先打开并执行 `schema.sql`，再打开并执行 `seed.sql`。

如果命令行 `sqlcmd` 因为加密或 Windows 身份验证报错，可以直接用 SSMS 图形界面执行：

1. 连接 `.\SQLEXPRESS`。
2. 身份验证选择 `Windows 身份验证`。
3. 打开并执行 `schema.sql`。
4. 打开并执行 `seed.sql`。
5. 打开并执行 `verify.sql`，确认用户数、商品数和 `ActiveProductView` 查询结果。

## 创建网站开发账号

不要长期用 `sa` 作为网站连接账号。先在 PowerShell 里确认 `sa` 密码变量已设置：

```powershell
$env:SQL_TEST_PASSWORD="你的 sa 密码"
```

然后创建 `campusloop_dev`。下面命令里的 `CampusLoopPassword` 是你给新账号设置的密码，不要提交到 GitHub：

```powershell
sqlcmd -S .\SQLEXPRESS -U sa -P $env:SQL_TEST_PASSWORD -C -v CampusLoopPassword="你自己设置的新密码" -i "database\create-dev-login.sql"
```

网站本地运行前设置：

```powershell
$env:DB_SERVER=".\SQLEXPRESS"
$env:DB_NAME="CampusLoopDB"
$env:DB_USER="campusloop_dev"
$env:DB_PASSWORD="你自己设置的新密码"
$env:DB_ENCRYPT="false"
$env:DB_TRUST_CERT="true"
npm run check:sql
npm start
```

`npm run check:sql` 通过后，注册用户和发布商品会写入 SQL Server。

## 已有数据库升级

已经存在 `CampusLoopDB` 时，不要重新执行会重建表的 `schema.sql`。配置好本地 `.env` 后执行：

```powershell
npm run migrate:auth
npm run migrate:product-description
npm run migrate:admin
npm run migrate:account
npm run migrate:transactions
npm run migrate:risks
npm run check:sql
npm run check:risks
```

迁移会保留现有业务数据。只执行尚未应用的迁移，执行前建议备份数据库。

## 和当前网站字段的对应关系

| 当前 JSON 字段 | SQL Server 字段 |
| --- | --- |
| `users[].id` | `Users.ExternalId` |
| `users[].name` | `Users.UserName` |
| `users[].campus` | `Users.Campus` |
| `users[].trustScore` | `Users.TrustScore` |
| `products[].id` | `Products.ExternalId` |
| `products[].sellerId` | `Products.SellerId` 关联 `Users.UserId` |
| `products[].category` | `Products.CategoryId` 关联 `Categories.CategoryId` |
| `products[].name` | `Products.ProductName` |
| `products[].description` | `Products.Description` |
| `products[].price` | `Products.Price` |
| `products[].originalPrice` | `Products.OriginalPrice` |
| `products[].condition` | `Products.ConditionLabel` |
| `products[].tags` | `Products.Tags`，第一版用逗号分隔，后续可拆成标签表 |
| `products[].image` | `ProductImages.ImageUrl` |

## 数据库验收

1. 能成功创建 `CampusLoopDB`。
2. 能查询 `dbo.ActiveProductView` 看到当前网站商品列表。
3. 表之间有主键、外键、唯一约束和基础索引。
4. 发布、预订、确认、完成、取消和争议操作能够同步更新数据库。
5. `RiskLogs` 不包含 `seed-demo`，真实风险能够由业务操作产生。

常用检查 SQL：

```sql
SELECT TOP (20) * FROM dbo.ActiveProductView ORDER BY CreatedAt DESC;
SELECT CategoryName, COUNT(*) AS ProductCount FROM dbo.ActiveProductView GROUP BY CategoryName;
SELECT RiskLevel, COUNT(*) AS RiskCount FROM dbo.RiskLogs GROUP BY RiskLevel;
```
