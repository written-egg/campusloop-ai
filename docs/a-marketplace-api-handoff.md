# A 商品管理与交易接口交接

所有接口都需要请求头：

```text
Authorization: Bearer <sessionToken>
```

统一响应格式：

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "storage": "sql-server"
}
```

## 我的商品

### 查询

```text
GET /api/my/products
```

返回当前登录用户的全部商品，包含 `on_sale`、`reserved`、`sold`、`offline`。主要字段：

```json
{
  "id": "p_xxx",
  "name": "商品名称",
  "description": "商品描述",
  "category": "数码电子",
  "price": 288,
  "condition": "九成新",
  "image": "data:image/jpeg;base64,...",
  "status": "on_sale",
  "createdAt": "2026-07-11T10:00:00.000Z",
  "updatedAt": "2026-07-11T10:00:00.000Z"
}
```

### 编辑

```text
PATCH /api/my/products/:productId
Content-Type: application/json
```

请求体可以包含一个或多个字段：

```json
{
  "name": "修改后的名称",
  "description": "修改后的描述",
  "price": 288
}
```

只有商品所有者能编辑，且商品必须为 `on_sale`。

### 下架

```text
POST /api/my/products/:productId/off-shelf
```

只有商品所有者能下架，且商品必须为 `on_sale`。成功后 `status` 为 `offline`。

## 交易

### 预订商品

```text
POST /api/products/:productId/reserve
```

最终价格由后端读取当前 `Products.Price`，不接受前端篡改。成功后创建 `pending` 交易，商品变为 `reserved`。卖家不能预订自己的商品。

### 查询我的交易

```text
GET /api/my/transactions
```

返回当前用户参与的买入和卖出交易。主要字段：

```json
{
  "id": "12",
  "productId": "p_xxx",
  "productName": "商品名称",
  "productImage": "/assets/products/camera.jpg",
  "finalPrice": 288,
  "status": "pending",
  "role": "buyer",
  "buyer": { "id": "u_buyer", "name": "买家" },
  "seller": { "id": "u_seller", "name": "卖家" },
  "createdAt": "2026-07-11T10:00:00.000Z",
  "finishedAt": null
}
```

### 卖家确认完成

```text
POST /api/transactions/:transactionId/finish
```

仅卖家可操作 `pending` 交易。成功后交易变为 `finished`，商品变为 `sold`。

### 取消交易

```text
POST /api/transactions/:transactionId/cancel
```

买家或卖家均可取消 `pending` 交易。成功后交易变为 `cancelled`，商品恢复 `on_sale`。

## 错误状态

| HTTP | 含义 |
| --- | --- |
| 400 | 输入无效或预订自己的商品 |
| 401 | 未登录或会话失效 |
| 403 | 尝试管理他人商品或无权变更交易 |
| 404 | 商品或交易不存在 |
| 409 | 商品或交易当前状态不允许操作 |
| 503 | SQL Server 未配置 |

## 验证

保持服务运行后执行：

```powershell
npm run check:marketplace-api
```

测试会自动创建并清理账号、商品和交易，不保留临时数据。
