# CampusLoop SQL Server database

这个目录是成员 A 第一天的数据库基础交付，目标是把当前 `data/db.json` 的用户和商品数据整理成后续可扩展的 SQL Server 结构。

## 文件

- `schema.sql`：创建 `CampusLoopDB`，包含用户、分类、商品、图片、交易、收藏、消息、AI 结果和风控日志等核心表。
- `seed.sql`：导入当前网站已有的示例用户、商品、封面图、收藏、消息和 AI 风控示例数据。
- `verify.sql`：验证建库、种子数据和商品视图是否成功。
- `create-dev-login.sql`：创建本地开发账号 `campusloop_dev`，用于网站后端连接数据库。

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

## 第一天验收

1. 能成功创建 `CampusLoopDB`。
2. 能查询 `dbo.ActiveProductView` 看到当前网站商品列表。
3. 表之间有主键、外键、唯一约束和基础索引。
4. 后续 B 可以按 `ActiveProductView` 的字段设计接口返回格式。

常用检查 SQL：

```sql
SELECT TOP (20) * FROM dbo.ActiveProductView ORDER BY CreatedAt DESC;
SELECT CategoryName, COUNT(*) AS ProductCount FROM dbo.ActiveProductView GROUP BY CategoryName;
SELECT RiskLevel, COUNT(*) AS RiskCount FROM dbo.RiskLogs GROUP BY RiskLevel;
```
