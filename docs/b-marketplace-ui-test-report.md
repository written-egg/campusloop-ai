# B 成员商品管理与交易前端测试报告

## 基本信息

- 日期：2026-07-11
- 功能分支：`feature/my-products-transactions-ui`
- 开发基线：`origin/dev`（`03fc317`）
- 测试昵称：卖家同学、买家同学
- 未记录：账号密码、数据库密码、会话令牌
- 修改范围：`public/index.html`、`public/app.js`、`public/styles.css`、`docs/`
- 未修改：`database/`、`lib/`、`server.js`、数据库迁移、后端自动化测试、`data/db.json`

## 完成功能

1. 登录后显示“我的商品”和“我的交易”，未登录访问时跳转登录页。
2. “我的商品”调用 `GET /api/my/products`，支持全部、在售、已预订、已售出、已下架筛选。
3. 在售商品支持编辑名称、描述和价格，调用 `PATCH /api/my/products/:productId`。
4. 在售商品下架前显示确认对话框，确认后调用 `POST /api/my/products/:productId/off-shelf`。
5. 商品详情页根据“我的商品”接口判断是否本人商品；本人商品禁止预订，其他在售商品可以预订。
6. 预订调用 `POST /api/products/:productId/reserve`，请求体不传最终价格。
7. “我的交易”调用 `GET /api/my/transactions`，支持“我买到的”和“我卖出的”筛选。
8. 卖家可以确认完成或取消待处理交易，买家只能取消待处理交易。
9. 完成和取消分别调用交易 `finish`、`cancel` 接口，成功后重新获取交易和商品列表。
10. 新页面包含加载、空数据、网络错误、401 会话失效和操作中禁用状态。

## 浏览器契约测试

测试使用与 A 接口文档完全一致的临时内存响应，目的是在本机未配置 SQL Server 时验证前端请求、权限和刷新逻辑。测试数据和会话仅存在于测试进程内，结束后自动消失。

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 登录后私有导航 | 通过 | “我的商品”“我的交易”均显示 |
| 我的商品查询 | 通过 | 卖家页面读取到 3 件商品 |
| 状态筛选 | 通过 | 英文状态请求值映射为中文文案 |
| 编辑商品 | 通过 | 名称、描述、价格刷新后仍为接口返回值 |
| 编辑 HTTP 409 | 通过 | 显示“当前状态不能编辑”并刷新列表 |
| 下架商品 | 通过 | 确认后状态由接口返回为 `offline` |
| 本人商品保护 | 通过 | 显示“不能预订自己的商品” |
| 买家预订 | 通过 | 创建 `pending` 交易，买家页只显示取消按钮 |
| 卖家确认完成 | 通过 | 交易变为 `finished`，商品变为 `sold` |
| 买家取消交易 | 通过 | 交易变为 `cancelled`，商品恢复 `on_sale` |
| 401 会话失效 | 通过 | 清除 `sessionStorage` 并跳转登录页 |
| 网络错误 | 通过 | 页面显示网络连接失败提示 |
| Authorization | 通过 | 受保护接口均携带当前会话 Bearer 请求头 |
| 390px 手机宽度 | 通过 | 无横向溢出、按钮和卡片无重叠 |
| JavaScript 页面异常 | 通过 | 浏览器测试未捕获页面脚本错误 |

## 命令检查

| 命令 | 结果 |
| --- | --- |
| `npm install` | 通过，75 个包，0 个已知漏洞 |
| `node --check public/app.js` | 通过 |
| `git diff --check` | 通过，仅有 Windows 换行提示 |
| `npm run check:marketplace-api` | 未通过：本机未配置 `DB_USER`、`DB_PASSWORD` |

## 截图证据

- `docs/screenshots/12-my-products.png`：我的商品列表与筛选
- `docs/screenshots/13-edit-success.png`：编辑商品成功
- `docs/screenshots/14-reserve-success.png`：买家预订成功
- `docs/screenshots/15-transaction-finished.png`：卖家确认交易完成
- `docs/screenshots/16-transaction-cancelled.png`：买家取消交易

## 仍需 A 在 SQL Server 环境复验

1. 使用真实注册账号完成卖家发布、编辑、下架和 SSMS 数据核对。
2. 使用真实买家账号预订商品，核对 `dbo.Transactions` 和商品 `reserved` 状态。
3. 分别完成和取消交易，核对 `finished/sold`、`cancelled/on_sale` 状态组合。
4. 在配置 `.env` 后运行 `npm run check:marketplace-api`，确认自动化测试创建并清理临时数据。

B 前端没有通过请求体传卖家编号决定权限，没有传预订最终价格，也没有使用 `localStorage` 伪造我的商品或交易数据。
