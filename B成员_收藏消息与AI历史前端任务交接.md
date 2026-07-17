# CampusLoop B 成员前端开发交接文档

## 1. 本次目标

B 成员负责补齐三个用户端模块：

1. 收藏与“我的收藏”。
2. 商品相关的站内消息。
3. AI 估价和风险评估历史记录。

目标是让 `Favorites`、`Messages`、`AIReports` 三张表在网页中有明确入口和可验证流程。A 已完成 API、SQL Server 查询和权限控制；B 负责前端接入，A 最终检查并合并。

## 2. Git 开发方式

从最新版 `dev` 创建功能分支：

```powershell
git switch dev
git pull origin dev
git switch -c feature/favorites-messages-ai-history-ui
```

开发完成后：

```powershell
git add public/index.html public/app.js public/styles.css docs/b-favorites-messages-ai-history-test-report.md
git commit -m "Add favorites messages and AI history UI"
git push -u origin feature/favorites-messages-ai-history-ui
```

推送后创建 PR：

- base：`dev`
- compare：`feature/favorites-messages-ai-history-ui`
- 不直接合并，由 A 检查并合并。

## 3. 允许修改的文件

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- 新建 `docs/b-favorites-messages-ai-history-test-report.md`

不要修改：

- `server.js`
- `lib/sqlStore.js`
- `database/` 下的 SQL 文件
- `.env`、`.env.example`
- `data/db.json`
- 登录、发布、我的商品和我的交易的现有接口逻辑

## 4. 收藏模块

### 4.1 商品详情

将当前禁用的“收藏”按钮改为可用按钮。

状态：

- 未登录：点击后跳转登录页。
- 未收藏：显示“收藏”。
- 已收藏：显示“取消收藏”，并使用选中样式。
- 请求中：按钮禁用，显示“处理中...”。
- 请求失败：显示清晰错误，不伪造成功状态。

接口约定：

```text
GET    /api/my/favorites
POST   /api/products/:productId/favorite
DELETE /api/products/:productId/favorite
```

接口已可用。`GET /api/my/favorites` 返回 `data` 数组，商品字段与“我的商品”基本一致，并额外包含 `favoriteId`、`favoritedAt`。

### 4.2 我的收藏页面

新增路由 `#my-favorites`，登录后在顶部导航显示“我的收藏”。

每张收藏卡显示：

- 商品图片、名称、价格、成色。
- 卖家、校区。
- 商品状态。
- “查看详情”和“取消收藏”。

必须包含加载、空数据、错误三种状态。已下架或售出的商品仍可显示，但不能预订。

## 5. 站内消息模块

### 5.1 联系卖家

将商品详情页当前禁用的“联系卖家”按钮改为可用按钮。

规则：

- 必须登录。
- 不能给自己发布的商品发送消息。
- 点击后进入 `#messages`，并带上当前商品上下文。

### 5.2 消息页面

新增路由 `#messages`，页面采用双栏结构：

- 左侧：会话列表，显示商品名称、对方昵称、最后一条消息和未读标记。
- 右侧：消息记录、商品摘要、输入框和发送按钮。

移动端改为单栏，先显示会话列表，进入会话后提供返回按钮。

接口约定：

```text
GET   /api/my/conversations
GET   /api/messages?productId=:productId&peerId=:peerId
POST  /api/messages
PATCH /api/messages/:messageId/read
```

以上接口已可用。会话对象主要字段为：

```json
{
  "id": "p1:u1",
  "productId": "p1",
  "productName": "商品名称",
  "productImage": "/assets/products/camera.jpg",
  "peerId": "u1",
  "peerName": "林同学",
  "lastMessage": "可以当面验货吗？",
  "unreadCount": 1,
  "createdAt": "2026-07-12T08:00:00.000Z"
}
```

发送消息请求：

```json
{
  "productId": "p1",
  "receiverId": "u1",
  "content": "你好，这件商品可以当面验货吗？"
}
```

输入要求：

- 去除首尾空格。
- 空消息不能发送。
- 最多 1000 个字符。
- 发送中禁止重复提交。
- 发送成功后使用后端返回记录更新页面。

## 6. AI 历史记录模块

新增路由 `#ai-history`，登录后在账户相关导航中显示“AI 记录”。

接口约定：

```text
GET /api/my/ai-reports?type=all
GET /api/my/ai-reports?type=price
GET /api/my/ai-reports?type=risk
```

接口已可用，返回结构：

```json
{
  "id": 11,
  "type": "risk",
  "provider": "deepseek",
  "score": 28,
  "result": {},
  "productId": null,
  "productName": null,
  "createdAt": "2026-07-12T08:00:00.000Z"
}
```

页面需要：

- “全部 / 智能估价 / 风险评估”筛选。
- 显示报告类型、模型来源、评分和创建时间。
- 估价报告显示建议价及价格区间。
- 风险报告显示风险等级、结论和主要建议。
- 点击卡片可展开完整结果。
- 明确区分 `deepseek` 和 `local-fallback`。

只展示当前登录用户的记录，不允许通过前端参数指定其他用户。

## 7. 统一前端要求

1. 所有请求携带现有 `Authorization: Bearer <sessionToken>`。
2. 登录失效时清除本地会话并跳转登录页。
3. 页面结果必须以后端返回为准，不使用 `localStorage` 模拟收藏、消息或报告。
4. 不在前端代码中加入数据库密码或 DeepSeek API Key。
5. 复用现有 `requestJson`、`getJson`、`postJson` 和错误处理方式。
6. 新页面沿用现有颜色、按钮、卡片和状态样式，不重做整站设计。
7. 不能破坏首页、登录、发布、我的商品、我的交易和 AI 页面。

## 8. 后端联调状态

后端已完成并通过：

- 收藏、取消收藏和收藏列表。
- 会话列表、消息查询、发送消息和标记已读。
- 当前用户 AI 历史查询及类型筛选。
- 登录校验、重复收藏、自收藏、消息参与方和跨账号访问限制。

B 可以直接使用本地 SQL Server 联调，不要写假成功数据或 `localStorage` 模拟数据。如果发现字段不足，在 PR 描述中列出，不要自行修改后端。

A 的后端验证命令：

```powershell
npm run check:social-ai-api
```

## 9. B 自测清单

- [ ] 未登录时看不到“我的收藏”“消息”“AI 记录”入口。
- [ ] 未登录点击收藏或联系卖家会进入登录页。
- [ ] 收藏和取消收藏按钮状态正确。
- [ ] “我的收藏”支持加载、空数据、错误状态。
- [ ] 不能联系自己。
- [ ] 消息发送不会重复提交，空内容不能发送。
- [ ] 会话切换不会混淆不同商品或用户的消息。
- [ ] AI 历史支持全部、估价、风险三种筛选。
- [ ] DeepSeek 与本地回退来源显示正确。
- [ ] 退出登录后清除收藏、消息和 AI 历史缓存。
- [ ] 重新登录另一账号时不会显示前一账号数据。
- [ ] 桌面端和手机端没有溢出、遮挡和按钮重叠。
- [ ] 浏览器控制台无 JavaScript 错误。

## 10. 提交给 A 的内容

B 完成后向 A 提供：

1. 功能分支和 PR 链接。
2. 修改文件清单。
3. 测试报告 `docs/b-favorites-messages-ai-history-test-report.md`。
4. 收藏、消息、AI 历史三个页面的截图。
5. 尚未解决的问题和需要 A 配合的接口字段。

不要把 `.env`、数据库密码、DeepSeek Key、测试用户真实密码或包含敏感信息的截图提交到 GitHub。
