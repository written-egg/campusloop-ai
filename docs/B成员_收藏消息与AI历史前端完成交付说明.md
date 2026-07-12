# B 成员收藏、消息与 AI 历史前端完成交付说明

## 一、交付概况

B 成员已完成本轮收藏、站内消息和 AI 历史记录的前端开发与浏览器联调，代码已推送到以下功能分支：

```text
feature/favorites-messages-ai-history-ui
```

合并目标：

```text
dev
```

请 A 在检查通过后合并，不要跳过验收直接合并。

详细测试记录见：

```text
docs/b-favorites-messages-ai-history-test-report.md
```

## 二、B 已完成的内容

### 1. 收藏功能

- 商品详情页已启用“收藏”和“取消收藏”。
- 未登录点击收藏会进入登录页。
- 收藏请求进行中会禁用按钮并显示“处理中...”。
- 收藏失败时显示后端错误，不会在前端伪造成功状态。
- 新增 `#my-favorites` 页面和登录后可见的“我的收藏”导航。
- 收藏卡片显示商品图片、名称、价格、成色、卖家、校区、商品状态和收藏时间。
- 已下架或已售出的收藏仍可显示，但不能继续预订。
- 页面具备加载、空数据和错误状态。
- 收藏数据全部来自后端接口，没有使用 `localStorage` 模拟。

使用接口：

```text
GET    /api/my/favorites
POST   /api/products/:productId/favorite
DELETE /api/products/:productId/favorite
```

### 2. 站内消息功能

- 商品详情页已启用“联系卖家”。
- 未登录点击后会进入登录页。
- 自己发布的商品不能联系自己。
- 新增 `#messages` 页面和登录后可见的“消息”导航。
- 桌面端采用会话列表和消息记录双栏布局。
- 会话列表显示商品名称、商品图片、对方昵称、最后一条消息和未读数量。
- 消息记录按 `productId + peerId` 隔离，切换会话不会混淆其他商品或用户的消息。
- 收到的未读消息会调用后端标记已读接口。
- 发送内容会去除首尾空格；空消息和超过 1000 字符的消息不能提交。
- 发送过程中按钮禁用，防止重复提交。
- 发送成功后使用后端返回的消息记录更新页面，并重新获取会话列表。
- 手机端采用单栏布局，进入会话后提供“返回会话”按钮。

使用接口：

```text
GET   /api/my/conversations
GET   /api/messages?productId=:productId&peerId=:peerId
POST  /api/messages
PATCH /api/messages/:messageId/read
```

### 3. AI 历史记录

- 新增 `#ai-history` 页面和登录后可见的“AI 记录”导航。
- 支持“全部 / 智能估价 / 风险评估”三种筛选。
- 显示报告类型、模型来源、评分、创建时间和关联商品。
- 估价报告显示建议价、价格区间和主要估价依据。
- 风险报告显示风险等级、结论和主要建议。
- 点击“展开完整结果”可以查看完整结果数据。
- `deepseek` 显示为“DeepSeek”，`local-fallback` 显示为“本地回退”。
- 估价和风险评估请求已携带当前登录用户标识和认证请求头，使报告能够关联当前用户。
- AI 历史查询没有提供指定其他用户的前端参数，只读取当前登录用户的记录。

使用接口：

```text
GET /api/my/ai-reports?type=all
GET /api/my/ai-reports?type=price
GET /api/my/ai-reports?type=risk
```

### 4. 登录状态与缓存清理

- 未登录时不显示“我的收藏”“消息”“AI 记录”入口。
- 所有本轮受保护请求均携带现有会话认证头。
- 接口返回 `401` 时会清除本地会话并进入登录页。
- 退出登录时会清除收藏、会话、消息和 AI 历史前端状态。
- 切换账号后不会继续显示上一个账号的私有数据。

## 三、本次修改文件

```text
public/index.html
public/app.js
public/styles.css
docs/b-favorites-messages-ai-history-test-report.md
docs/screenshots/17-my-favorites.png
docs/screenshots/18-messages.png
docs/screenshots/19-ai-history.png
docs/B成员_收藏消息与AI历史前端完成交付说明.md
```

本次没有修改：

```text
server.js
lib/sqlStore.js
database/
.env
.env.example
data/db.json
package.json
package-lock.json
```

## 四、B 已完成的测试

- `node --check public/app.js`：通过。
- `git diff --check`：通过。
- 登录和未登录导航显示：通过。
- 收藏和取消收藏状态切换：通过。
- 收藏列表在售、已下架状态展示：通过。
- 商品详情进入对应卖家会话：在商品包含 `sellerId` 的接口契约数据下通过。
- 消息内容去空格、发送成功、会话隔离：通过。
- AI 全部、估价、风险三种筛选：通过。
- DeepSeek 和本地回退来源区分：通过。
- 退出登录清理私有状态：通过。
- 浏览器控制台 JavaScript 错误：0 个。
- 390 x 844 手机尺寸：`scrollWidth = clientWidth = 390`，没有横向溢出。
- 手机端会话列表、消息线程和返回按钮切换：通过。

本机没有配置 SQL Server 的 `DB_USER` 和 `DB_PASSWORD`，因此以下真实数据库检查需要 A 在已配置环境中重新执行：

```powershell
npm run check:social-ai-api
```

## 五、需要 A 处理：公开商品缺少 sellerId

### 1. 问题是什么

买家第一次点击“联系卖家”时，前端需要调用：

```text
POST /api/messages
```

请求必须包含卖家的唯一账号 ID：

```json
{
  "productId": "p1",
  "receiverId": "u123",
  "content": "你好，可以当面验货吗？"
}
```

这里的 `receiverId` 应当来自商品的 `sellerId`，不能使用卖家昵称代替。昵称可能重复，也不是消息接口接受的用户标识。

目前 SQL Server 版本的公开商品映射 `mapProduct()` 返回了 `sellerName`，但没有返回 `sellerId`。因此会出现：

- 已经存在会话：前端可以从会话的 `peerId` 继续聊天。
- 第一次联系卖家：没有历史会话，也没有 `sellerId`，前端无法确定消息接收人。

前端当前会显示明确错误，不会猜测接收人，也不会伪造发送成功。

### 2. 建议 A 的处理方式

建议让公开商品接口返回只读的卖家外部 ID，例如：

```json
{
  "id": "p1",
  "name": "富士 X100V",
  "sellerId": "u123",
  "sellerName": "林同学"
}
```

预计需要检查 `lib/sqlStore.js` 中公开商品查询和 `mapProduct()` 的字段映射。补充后请验证：

1. `GET /api/products` 的商品对象包含 `sellerId`。
2. `sellerId` 等于该商品发布者的 `ExternalId`。
3. 买家第一次点击“联系卖家”可以进入新会话并成功发送消息。
4. 卖家点击自己的商品时仍不能联系自己。

## 六、建议 A 额外确认：AI 报告用户归属

当前前端会在估价和风险评估请求中发送当前登录用户 ID。为了避免调用者篡改请求体，把报告保存到其他用户账号，建议 A 确认后端保存 AI 报告时最终以服务端会话用户为准，而不是只信任请求体中的 `userExternalId`。

理想规则：

```text
AIReports.UserId = 当前有效 session 对应的用户
```

未登录生成的 AI 结果可以正常返回，但是否写入用户历史应由后端明确决定。

## 七、A 合并前验收清单

- [ ] 在已配置 SQL Server 的环境运行 `npm run check:social-ai-api`。
- [ ] 登录后可以收藏和取消收藏商品。
- [ ] 刷新页面后收藏状态仍然存在。
- [ ] “我的收藏”可以显示在售和已下架商品。
- [ ] `GET /api/products` 已补充 `sellerId`。
- [ ] 买家可以第一次从商品详情联系卖家。
- [ ] 卖家不能给自己发送消息。
- [ ] 消息发送、会话切换和未读标记正常。
- [ ] AI 估价和风险报告能保存到当前用户历史。
- [ ] 切换账号后不会读取其他账号的收藏、消息和 AI 报告。
- [ ] 桌面端和手机端页面没有溢出或遮挡。
- [ ] 确认无敏感信息后，将功能分支合并到 `dev`。

## 八、可直接发送给 A 的简短说明

```text
B 已完成收藏、站内消息和 AI 历史记录前端，代码在 feature/favorites-messages-ai-history-ui。请先查看 docs/B成员_收藏消息与AI历史前端完成交付说明.md 和 docs/b-favorites-messages-ai-history-test-report.md，再在 SQL Server 环境运行 npm run check:social-ai-api。当前需要 A 补充 GET /api/products 返回的 sellerId，否则买家第一次从商品详情联系卖家时无法确定 receiverId。检查通过后请合并到 dev。
```
