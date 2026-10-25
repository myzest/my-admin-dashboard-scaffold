# 公共开发规范

## 技术栈

| 层面     | 约定                                                   |
| -------- | ------------------------------------------------------ |
| 语言     | JavaScript / JSX，不使用 TypeScript                    |
| 框架     | Next.js Pages Router，页面与 API Routes 放在同一项目   |
| UI       | Arco Design React                                      |
| 工具函数 | Lodash，优先用于数据读取、字段筛选和集合处理，按需导入 |
| 数据访问 | Sequelize，统一管理连接、模型、查询和事务              |
| 数据库   | 默认 MySQL；PostgreSQL / SQLite 为兼容目标，需逐库验证 |
| AI 开发  | Codex + Claude，共用规范与项目 skills                  |

## 1. 返回值

- API 成功：`{"status":true,"data":{},"error":{}}`。
- API 失败：`{"status":false,"data":{},"error":{"code":"USER_NOT_FOUND","message":"用户不存在"}}`。
- 成功时 `error` 为空对象，失败时 `data` 为空对象；HTTP 状态码与结果一致。
- 字段错误可在 `error.fields` 返回 `{ fieldName: '错误信息' }`，保留整体 `code` / `message`；前后端复用浏览器安全的 Zod schema，表单只映射已注册字段。
- 分页统一放入 `data`：`{"items":[],"pagination":{"page":1,"pageSize":20,"total":0}}`。
- Bull Board 专用 `/api/admin/bull-board` 前缀使用其原生协议；外层页面的 `_status` 检查仍使用项目封装。面板入口统一验证管理员会话。
- 普通函数成功返回业务数据，失败抛出明确错误，由 API 层统一转换响应。
- 单条查询无结果返回 `null`，非分页列表无结果返回 `[]`；分页沿用上述结构，`items` 为空数组。
- 异步流程统一使用 `async/await`，不吞掉异常，不返回敏感内部信息。

## 2. 模块化

- 按业务模块组织代码，模块内按职责拆分，按需创建目录。
- 当前处于脚手架开发阶段，允许按需求重构和删除旧实现，不为已移除的页面或接口保留兼容层。
- 管理员页面与 API 分别放在 `pages/admin`、`pages/api/admin`；用户侧对应 `pages/user`、`pages/api/user`。菜单、页面和业务服务分别维护。
- 同一模块涉及两端时按需拆分 `admin` / `user` 入口；禁止按角色用条件分支或模式参数切换业务。认证、授权、参数校验和错误处理可正常判断。
- 公共认证、模型、组件和基础方法可以复用；两端业务互不调用，用户查询必须绑定会话身份，缺少身份不得退化为全量查询。
- 页面与 API 保持轻量，组件负责展示与交互，业务逻辑放在所属模块。
- service 可直接操作 Sequelize；client、repository 等按实际需要抽取，不强制每个模块分层。
- 跨模块只调用公开接口，禁止引用对方内部实现或直接修改其数据。
- 公共基础层不依赖具体业务，禁止循环依赖。
- 客户端与服务端入口分开，客户端不得导入数据库、密钥或服务端实现。
- 同一业务规则保持唯一实现，不增加无实际职责的转发层。

## 3. 命名

| 类型                  | 规则                | 示例                              |
| --------------------- | ------------------- | --------------------------------- |
| 目录、普通文件        | 小写短横线          | `api-keys`、`user-service.js`     |
| 组件、类              | 大驼峰              | `UserTable`、`ServiceError`       |
| Hook                  | use 前缀            | `useUserList`                     |
| 变量、参数、JSON 字段 | 小驼峰              | `userId`、`pageSize`              |
| 函数、方法            | 动词＋业务对象      | `getUserById`、`createUser`       |
| 布尔值                | is / has / can 前缀 | `isLoading`、`hasPermission`      |
| 固定常量、错误码      | 大写下划线          | `MAX_PAGE_SIZE`、`USER_NOT_FOUND` |

- 组件和 Hook 文件与导出名称一致；操作统一使用 `get/list/create/update/delete`。
- 名称表达职责，避免 `handleData`、`doSomething`、`utils2` 等含糊命名。

## 4. 工具函数

- 优先使用语言原生能力和已有工具库，重复且语义一致的逻辑再提取。
- 按用途拆分，例如 `utils/date.js`、`utils/string.js`，避免巨型 `utils.js`。
- 工具函数输入输出明确，不混入界面、请求或数据库操作。
- 业务专用函数留在所属模块，不为库函数增加无意义的包装。

## 5. 通用组件

- 按钮、表单、表格、弹窗等基础组件直接使用选定的 UI 库。
- 重复的组件组合与交互可封装，业务组件留在所属模块。
- 公共组件通过 props 和事件协作，不调用具体业务接口，不包含业务特判。
- 避免大量布尔参数堆成万能组件；保留必要的原组件能力。
- 异步界面覆盖加载、空态、错误和重试；表单提供校验与提交状态。

## 6. 开源库

- 实现前先检查现有依赖；成熟开源库能满足需求时优先使用。
- 需要统一项目行为时做轻量封装，现有方案无法满足时再自行实现。
- 同类能力保持一套方案，避免重复工具库和多套 UI 库。
- 新增依赖考虑维护状态、许可证、兼容性和体积；支持按需导入的库按需使用。
- 站点名称与 Logo 统一读取 `src/config/site.js`，不在页面重复写品牌信息。

## 7. 数据库与账号

- 改字段时同步更新模型、新增迁移和必要测试；不改已执行的迁移，不用 `sync({ alter: true })` / `force` 改库。
- 执行方法见 [数据库迁移](docs/database-migrations.md)：先备份，再由单个进程执行 `npm run db:migrate`，最后部署对应代码。
- 角色固定为 `admin` / `user`；两端页面和 API 显式声明对应角色。公共登录、注册、退出和注册开关读取位于 `api/auth`；用户接口必须从会话确定身份，不信任请求中的角色或用户编号。
- 新建或编辑用户名至少 5 位，新密码至少 6 位；密码不做复杂度校验，保留 bcrypt 的 72 字节上限。既有短用户名允许登录和密码恢复。
- 停用和重置密码必须与会话撤销同事务，并锁定账号；启用不恢复旧会话，重置不改变角色或启停状态。管理员恢复使用 `npm run admin:reset-password`。
- 余额保留四位小数，API 使用字符串；禁止浮点运算和负余额，超过四位直接拒绝。调账、日志写入在同一事务中，锁定用户并按操作编号去重。
- 硬删除普通用户时，同步删除其余额、日志和全部会话；新建用户关联表必须声明删除行为。
- 管理员业务操作日志与业务变更同事务，操作者来自会话，变更字段使用白名单；禁止保存密码、哈希、Cookie 或原始请求。硬删除清除用户关联操作日志，删除事件不保留目标身份；余额操作使用既有余额日志。

## 8. 后台任务

- 持久任务统一使用 BullMQ + Redis，由独立 Worker 执行；定义集中在 `src/jobs/registry.js`，业务处理函数留在所属模块，通过公开服务端入口调用。
- 任务参数使用 Zod 校验，定时定义使用稳定 ID 并显式声明时区。启动、移除调度和扩展方式见 [后台任务](docs/background-jobs.md)。
- 任务按至少一次执行设计，处理函数必须幂等；队列去重不能代替业务事务与唯一约束。MySQL 提交与 Redis 投递需要可靠联动时使用同事务 Outbox，不把普通提交后回调当成原子保证。
- 长任务分批并限制单次工作量；参数、结果和失败记录不得保存密码、Cookie、原始 SQL 等敏感内容。各环境使用独立 Redis 或队列前缀。
- Bull Board 保留管理员原生完整操作权限；队列管理记录为服务端运维事件，任务内部业务变更仍遵循事务审计。面板重试与调度语义见 [后台任务面板](docs/job-board.md)。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
