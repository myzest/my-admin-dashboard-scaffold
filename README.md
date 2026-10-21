# Admin Starter

一套轻量后台脚手架：管理员与普通用户共用登录，页面、API 和业务服务分别维护；内置用户管理、账号启停和密码重置、可开关注册、四位小数余额和日志，以及可照着扩展的分类 CRUD 示例。

技术栈：JavaScript / JSX、Next.js Pages Router、Arco Design React、Lodash、Sequelize。首版验证 MySQL，PostgreSQL / SQLite 留待后续兼容验收。

## 本地启动

需要 Node.js 22.x（至少 22.13）或 >= 23.5，以及 MySQL；项目 `.nvmrc` 当前为 26.3.0。

```bash
npm ci
cp .env.example .env.local
```

用数据库管理员创建专用数据库和用户。将示例密码替换成自己的强密码：

```sql
CREATE DATABASE admin_starter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'admin_starter'@'localhost' IDENTIFIED BY 'replace-with-a-strong-db-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
ON admin_starter.* TO 'admin_starter'@'localhost';
```

填写 `.env.local`：

| 配置                                                      | 用途                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` | 上面创建的数据库连接                                       |
| `DB_POOL_MAX`                                             | 每个应用进程的连接池上限，默认 10                          |
| `SESSION_SECRET`                                          | 至少 32 字符的随机密钥                                     |
| `ADMIN_USERNAME`、`ADMIN_PASSWORD`                        | 初始管理员；用户名至少 5 位，密码至少 6 位且不超过 72 字节 |

生成会话密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

初始化并启动：

```bash
npm run db:setup
npm run dev
```

打开 `http://127.0.0.1:3000/login`，使用配置的管理员登录。

| 入口                              | 功能                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `/admin/users`                    | 管理员首页；创建、编辑、搜索、启停普通用户，重置密码、调整余额或硬删除 |
| `/admin/settings`                 | 管理员开启或关闭公开注册，初始默认关闭                                 |
| `/register`                       | 开放注册时创建普通用户，随后回登录页登录                               |
| `/user/dashboard`                 | 普通用户首页；查看本人账号资料与余额                                   |
| `/admin/profile`、`/user/profile` | 分别查看本人账号资料、修改密码                                         |
| `/admin/balance-logs`             | 查看全部余额日志，支持按用户筛选                                       |
| `/user/balance-logs`              | 只查看本人的余额日志                                                   |
| `/admin/categories`               | 管理员分类 CRUD 示例                                                   |

业务 API 使用 `/api/admin/*` 和 `/api/user/*`，各自校验固定角色；本人资料和改密接口分别为各端的 `/me`、`/password`。公共认证保留 `/api/auth/login`、`logout`、`register`、`registration`。

项目处于脚手架开发阶段；旧的无前缀业务页面和 API，以及 `/api/auth/me`、`/api/auth/password` 已移除，返回 404，不提供兼容跳转。两端共用数据库模型、基础方法和展示组件，不在同一业务实现内按角色切换查询范围。

账号角色固定为管理员和普通用户，不提供自选角色或角色管理。新用户余额为 `0.0000`。管理员手动增加或扣减余额，金额超过四位小数或扣成负数会被拒绝；余额与日志同步提交，重复操作编号不会重复入账。金额上限为 `9999999999999999.9999`，API 金额均为字符串。

调账结果未确认时保留原参数和操作编号；关闭弹窗或刷新后，重新打开可继续确认同一笔调整。当前标签页恢复记录不可写入时，不发送新调账。关闭标签页或清除浏览器数据后，应先核对余额日志，再决定是否重新操作。

硬删除普通用户会删除账号、剩余余额、所有余额日志及会话，余额非零也允许删除，界面会二次确认。修改密码需要原密码，成功后所有会话失效并重新登录。

已有账号和新账号默认启用。管理员停用普通用户后，该账号无法登录，所有旧会话失效；账号、余额和日志保留，管理员仍可管理。重新启用后需要重新登录，旧会话不会恢复。重置密码不会改变启停状态。

## 密码重置

普通用户忘记密码时，管理员在“用户管理 → 重置密码”设置新密码，成功后撤销该用户全部会话。新密码至少 6 位、不超过 72 字节，不做复杂度校验，允许纯数字。

管理员忘记密码时，在服务器项目目录执行：

```bash
npm run admin:reset-password
```

依次输入已有管理员用户名、新密码和确认密码；密码隐藏输入，不接收命令行参数或管道。此命令只需要数据库配置，仅重置已有管理员并撤销其全部会话，不创建账号或改变角色。`Ctrl+C` 可在输入阶段取消。

`db:setup` 执行迁移并创建初始管理员；重复执行会保留已有账号和密码。没有内置默认密码。`.env.local` 已被 Git 忽略。

新建或编辑用户名时要求至少 5 位；既有短用户名仍可登录和恢复密码，不自动改名。注册、创建账号、本人改密和管理员重置使用相同的新密码规则。

数据库与会话配置独立：`db:migrate` 只需要数据库配置，首次 `db:seed` 还需要初始管理员输入；应用启动时同时检查数据库配置和 `SESSION_SECRET`。

## 站点名称与 Logo

修改 `src/config/site.js` 的 `name` 和 `logo` 即可统一登录页、注册页、侧栏及页面标题。`logo` 为空时使用默认图标；自定义图片放入 `public/`，例如 `public/logo.svg` 对应 `logo: '/logo.svg'`。生产环境修改后重新构建部署。

## 普通服务器部署

部署使用常驻 Node.js 服务，由服务管理器提供环境变量。初始账号创建后，运行服务不再需要 `ADMIN_PASSWORD`。

```bash
npm ci
npm run db:setup
npm run build
npm run start
```

服务默认监听 `127.0.0.1:3000`，可由 Nginx 等反向代理提供访问入口。应用不校验固定 Origin，也不需要 `APP_ORIGIN`。按已确认选择，会话 Cookie 使用 `secure: false`，保留 `HttpOnly` 和 `SameSite=Lax`。

后续发布先备份数据库，再由单个部署进程运行 `npm run db:migrate`。字段迭代、旧版升级和失败处理见 [数据库迁移](docs/database-migrations.md)。旧版升级保留管理员账号密码，浏览器需要重新登录。

## 增加业务模块

```text
src/
  pages/admin/           管理员页面
  pages/user/            用户页面
  pages/api/admin/       管理员 API
  pages/api/user/        用户 API
  pages/api/auth/        公共认证 API
  modules/auth/          登录、会话与服务端鉴权
  modules/users/         共享账号基础；admin / user 各自业务入口
  modules/balance/       admin / user 各自页面、共享日志展示
  modules/settings/      注册开关
  modules/categories/    完整 CRUD 示例
  components/            通用展示组件
  config/                两端菜单、登录后的首页与站点配置
  lib/request.js         浏览器统一请求函数
  server/                数据库连接、配置与 API 处理
database/migrations/     数据库迁移
```

1. 参照 `categories` 创建业务模块，定义模型、参数校验和业务方法。
2. 增加迁移文件，使用 `npm run db:migrate` 更新结构。
3. 在 `pages/api/admin` 或 `pages/api/user` 添加薄入口，使用 `createApiHandler` 并显式指定 `{ role: 'admin' }` 或 `{ role: 'user' }`。两端业务服务独立；涉及两端的模块按需拆分 `admin` / `user`，共用模型和基础方法。
4. 在对应的 `pages/admin` 或 `pages/user` 组合页面，使用 `requirePageAuth(context, { role: 'admin' })` 或 `{ role: 'user' }`，并更新所属菜单。公共组件只接收展示数据与回调，不按角色切换业务。

页面和 API 调用模块公开入口。浏览器只导入 `client.js`，服务端代码通过 `server.js` 导出。service 可直接操作 Sequelize，出现实际复用需求后再提取 repository 或公共组件。

普通用户数据从当前会话确定归属，缺少身份时立即失败；用户查询不能调用管理员的全量查询入口。余额写入统一调用管理员业务中的 `changeUserBalance`；新增用户关联表时明确硬删除行为，不能遗漏日志或会话。

API 统一返回 `{ status, data, error }`，错误同时使用对应 HTTP 状态码；分页数据为 `{ items, pagination: { page, pageSize, total } }`。普通函数返回业务数据或抛错；单条查询无结果返回 `null`。

列表查询校验已定义的分页、搜索参数，并忽略额外查询字段。用户余额日志接口不接受 `userId`，传入时返回 400；查询身份始终来自会话。

详细规范见 [AGENTS.md](AGENTS.md) 和 [CLAUDE.md](CLAUDE.md)，两者保持一致。

## 验证

```bash
npm run lint
npm run format:check
npm test
```

集成和浏览器测试使用真实 MySQL 与应用服务。请创建独立测试库，将 `DB_NAME` 配置为以 `_test` 结尾的名称，完成 `db:setup` 后启动应用；不要使用业务库。另开终端运行：

```bash
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

测试默认访问 `http://127.0.0.1:3000`；需要其他地址时，通过 `TEST_BASE_URL` 覆盖，例如 `TEST_BASE_URL=http://127.0.0.1:3001 npm run test:integration`。目标应用与测试进程必须使用同一测试数据库配置；`_test` 后缀检查只验证测试进程的配置。

集成测试与 E2E 之间重启应用服务，清空本进程的登录限流计数；生产限流不因测试而放宽。迁移测试另用空库，执行方式见 [数据库迁移](docs/database-migrations.md)。

当前限制、待确认事项和验收记录见 [implementation-notes.md](docs/implementation-notes.md)。
