# A 成员账户与数据库接口交接

## 开发基线

- 分支：`feature/db-auth-advanced`
- 数据库迁移：`npm run migrate:auth`
- 数据库检查：`npm run check:auth-db`
- 认证接口检查：`npm run check:auth-api`
- 高级对象检查：`npm run check:advanced-db`

真实 `.env`、数据库密码和会话令牌不得提交到 GitHub。

## 注册

`POST /api/auth/register`

```json
{
  "loginName": "student01",
  "password": "Campus123!",
  "name": "张同学",
  "campus": "南校区"
}
```

成功：

```json
{
  "ok": true,
  "data": {
    "id": "u_xxx",
    "loginName": "student01",
    "name": "张同学",
    "campus": "南校区",
    "trustScore": 82,
    "createdAt": "2026-07-10T00:00:00.000Z",
    "sessionToken": "仅保存在当前浏览器本地会话"
  },
  "error": null
}
```

账号要求为 4-30 位小写或大写字母、数字、下划线；服务端统一转为小写。密码至少 6 个字符。

## 登录

`POST /api/auth/login`

```json
{
  "loginName": "student01",
  "password": "Campus123!"
}
```

成功返回与注册相同的用户字段和新 `sessionToken`。账号或密码错误返回 HTTP `401`；重复账号返回 HTTP `409`。

## 退出

`POST /api/auth/logout`

请求头：

```text
Authorization: Bearer <sessionToken>
```

成功返回：

```json
{
  "ok": true,
  "data": { "loggedOut": true },
  "error": null
}
```

B 在退出成功后应清除浏览器保存的 `sessionToken` 和当前用户。

## 注册账号发布商品

现有 `POST /api/products` 请求体保持不变，但注册账号必须携带登录返回的令牌：

```text
Authorization: Bearer <sessionToken>
```

前端仍传 `sellerId`，服务端会校验它必须与令牌对应的用户一致。无效卖家返回 HTTP `400`；注册账号缺少或使用错误令牌返回 HTTP `401`。

商品和封面图在同一个 SQL Server 事务中写入。任一步失败都会整体回滚。

## B 页面联调要求

1. 登录/注册页改用 `/api/auth/register` 和 `/api/auth/login`。
2. 将 `sessionToken` 保存在 `sessionStorage`，不要写进 HTML、截图或 GitHub。
3. 调用 `/api/products` 发布时添加 `Authorization` 请求头。
4. 退出时调用 `/api/auth/logout`，随后清理当前用户和令牌。
5. 分别展示重复账号、密码错误、登录失效和数据库不可用错误。
