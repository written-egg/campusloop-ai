# B 成员账户与商品页面联调报告

## 基本信息

- 日期：2026-07-10
- 开发分支：`feature/account-market-ui`
- 开发基线：`origin/feature/db-auth-advanced`（`b857d3f`）
- 修改范围：`public/index.html`、`public/app.js`、`public/styles.css`、`docs/`
- 未修改：`database/`、`lib/`、`server.js`、`package.json`、`package-lock.json`、`data/db.json`

## 完成功能

1. 登录和注册表单支持切换，包含账号、密码、确认密码、昵称、校区及密码显隐控制。
2. 前端校验账号格式、密码长度、两次密码一致性、昵称和校区必填，并在提交期间禁用按钮。
3. 登录与注册分别接入 `POST /api/auth/login` 和 `POST /api/auth/register`。
4. 当前用户与 `sessionToken` 分开保存在 `sessionStorage`，页面刷新后恢复会话；密码不保存。
5. 退出调用 `POST /api/auth/logout`，携带 Bearer 令牌，随后清除当前浏览器会话并返回首页。
6. 未登录访问发布页自动跳转登录页；发布请求携带 Bearer 令牌和当前用户 `sellerId`。
7. 商品卡片和搜索结果进入详情页，不再跳转发布页。
8. 详情页展示图片、名称、价格、原价折扣、成色、描述、标签、卖家、校区、信用分、浏览量和发布时间。
9. 收藏、联系卖家和立即预订作为禁用占位按钮保留，不连接数据库。
10. 商品加载、空列表、商品不存在、网络失败和接口错误均有面向普通用户的提示。

## 验收结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 登录/注册切换 | 通过 | 桌面与 390px 移动端均正常，无横向溢出 |
| 账号、密码和确认密码校验 | 通过 | 使用中文提示，不在日志中输出密码 |
| 重复账号 HTTP 409 | 通过 | 显示“账号已经存在” |
| 错误密码 HTTP 401 | 通过 | 显示账号或密码错误 |
| SQL 未配置 HTTP 503 | 通过 | 真实本地接口返回 503，页面显示数据库环境提示 |
| 注册/登录成功弹框 | 通过（契约模拟） | 响应字段与 A 的交接文档一致 |
| 会话刷新恢复 | 通过（契约模拟） | 用户和令牌均从 `sessionStorage` 恢复 |
| 发布请求认证 | 通过（契约模拟） | Bearer 请求头正确，`sellerId` 等于当前用户 ID |
| 退出请求与清理 | 通过（契约模拟） | Bearer 请求头正确，退出后用户和令牌均清除 |
| 商品列表与详情页 | 通过 | 本地加载 9 个商品，卡片进入详情页 |
| 空商品/商品不存在/网络失败 | 通过 | 三种状态均显示明确提示 |
| HTTP 400/401/409/413/503 映射 | 通过 | 不显示服务器错误堆栈 |
| AI 发布与语义搜索 | 通过 | 无 API Key 时继续使用后端本地 fallback |
| 控制台脚本错误 | 通过 | 测试页面无 JavaScript 异常 |

说明：契约模拟仅用于在 B 本机没有 SQL Server 凭据时验证前端请求与响应处理。模拟令牌只存在于测试浏览器内存，没有写入代码、截图或 Git 历史。

## 命令检查

| 命令 | 结果 |
| --- | --- |
| `npm install` | 通过，未修改包文件 |
| `node --check public/app.js` | 通过 |
| `git diff --check` | 通过，仅有 Windows 换行提示 |
| `npm run migrate:auth` | 未执行成功：本机未配置 `DB_USER`、`DB_PASSWORD` |
| `npm run check:auth-db` | 未执行成功：本机未配置 SQL Server |

## 截图

- `docs/screenshots/07-product-detail.png`：商品详情页
- `docs/screenshots/08-account-register-error.png`：SQL Server 未配置提示
- `docs/screenshots/09-register-success.png`：注册成功弹框（契约模拟）
- `docs/screenshots/10-authenticated-publish.png`：带认证发布成功（契约模拟）
- `docs/screenshots/11-login-success.png`：登录成功弹框（契约模拟）

## 需要 A 复验或处理

1. A 需要在配置真实 SQL Server 的环境运行 `npm run migrate:auth`、`npm run check:auth-db`、`npm run check:auth-api`，并复验注册、登录、发布和退出的完整成功链路。
2. 当前 `lib/sqlStore.js` 的 `mapProduct()` 没有把 `row.Description` 映射为前端 `description`。B 按约定未修改后端；详情页在该字段缺失时会显示安全的占位描述。建议 A 在后端分支统一补充该字段。
3. 自动化环境无法连接 Google Fonts 时会使用系统中文字体回退，不影响功能。
