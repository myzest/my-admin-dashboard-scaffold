# 后台任务面板

管理员登录后，从“后台任务”进入 `/admin/jobs`。页面保留现有导航，通过同源 iframe 展示 Bull Board 原版简体中文 UI。面板接入当前环境的 `background` 队列，Redis 地址和队列前缀与 Worker 一致。

采用同版本的 `@bull-board/api`、`@bull-board/ui`、`@bull-board/express`，由 Next.js Pages Router 的 API Route 承载 Express 适配器；没有额外监听端口。UI 静态资源来自安装包，生产部署仍须安装运行依赖。

## 操作范围

管理员拥有所安装版本在当前 BullMQ 上提供的完整操作权限。没有只读配置、管理模式开关或额外动作白名单；任务投递、参数编辑、失败／完成任务重试、暂停／恢复、清理／删除及调度操作均遵循原生行为和 BullMQ 的状态约束。

面板提供队列相关 Redis 状态，不是通用 Redis 数据编辑器。任务详情来自 Redis 中实际保留的数据；默认成功记录最多保留 7 天／1,000 条，失败记录最多保留 30 天／5,000 条，沿用 BullMQ 的惰性清理；通过原生任务选项覆盖时，以任务实际配置为准。Worker 控制台日志不会自动变成任务日志，长期指标历史也没有自动启用。

## 与任务代码的关系

- 面板直接操作 Queue，不经过 CLI 的 `createJob()` 入队封装。Worker 仍按任务注册表检查名称并使用 Zod 校验参数；未知任务或非法参数进入队列后会失败。新增可执行的业务任务仍须按 [后台任务](background-jobs.md) 注册处理函数。
- Bull Board 使用原生 `job.retry(state)`，可以重试失败或已完成任务，不主动重置尝试次数。现有 CLI 只重试失败任务并传入 `resetAttemptsMade: true`，两种入口保持各自语义。
- Worker 启动时根据代码注册表调用 `upsertJobScheduler()`。面板修改、删除代码中已有的调度后，下一次 Worker 启动可能覆盖修改或恢复调度。需要永久变更时同步调整注册表，移除步骤见后台任务文档。
- 面板不会启动额外 Worker，也不会在打开页面时注册调度。队列数据存在不代表 Worker 正在运行；原生 Worker 信息还依赖 Redis 对相关命令的支持。

## 认证、请求与日志

`/admin/jobs` 和 `/api/admin/bull-board` 下的 HTML、资源及 API 都校验现有管理员会话。普通用户、过期／撤销会话和停用账号不能访问。页面先检查连接，再加载面板，并每 30 秒及重新聚焦时检查会话与 Redis；连接检查失败或入口返回异常文档时卸载面板并提供重试，401 返回登录页。原版 UI 内的请求和脚本运行错误由原版 UI 或浏览器处理。

`/api/admin/bull-board` 是第三方协议专用前缀：原生 API 不使用项目的 `{ status, data, error }` 封装；仅供外层页面使用的 `GET /api/admin/bull-board/_status` 沿用项目封装。`_status` 检查管理员会话和 Redis 可用性，不表示 Worker 健康。未知路径保持 404。

写请求使用 `csrf-csrf` 的签名 double-submit token，绑定已验证的会话 Cookie。HTML 和 `_status` 签发面板路径内的 `XSRF-TOKEN`，原生 Axios 自动发送 `x-xsrf-token`；缺失、伪造和跨会话 token 被拒绝。会话 Cookie 沿用项目现有配置。

响应禁止缓存；仅面板前缀使用 `X-Frame-Options: SAMEORIGIN` 和 `frame-ancestors 'self'`，其他页面保持 `DENY`。反向代理应保留这些响应头，避免额外添加与面板冲突的 `DENY`。

进入面板处理器的已认证写请求产生结构化 `job-board-operation` 服务端日志，包括请求编号、会话操作者 ID、HTTP 方法、路由动作、队列／任务／调度 ID 和响应状态。动作标识来自服务端路由，拒绝在进入原生处理器之前发生时记作 `unmatched`。首次连接队列失败时尚未进入面板处理器，仅记录服务错误。不保存请求体、任务参数、密码或 Cookie。该记录反映 HTTP 操作结果，不保证 Redis 与 MySQL 跨存储原子提交；任务业务处理中的数据库变更继续使用所属业务模块的事务审计。

原生未处理异常经过脱敏再返回，详细任务失败信息沿用 Worker 已有的固定错误码处理。

## 实现位置

- `src/modules/job-board/`：页面、面板适配、连接生命周期和安全错误响应。
- `src/pages/admin/jobs.jsx`：管理员页面入口。
- `src/pages/api/admin/bull-board/[[...path]].js`：原生面板入口，关闭 Next.js bodyParser，由 Express 处理响应。
- `next.config.mjs`：服务端依赖外置、UI 资源追踪和同源嵌入响应头。

Queue 在首次通过鉴权的请求中创建，Web 进程内复用；开发热更新保留连接、重新建立模块路由。首次连接失败关闭资源并允许重试，已建立连接沿用断线重连。面板错误不增加普通页面和登录的 Redis 查询依赖。

## 验证

准备独立 `.env.test.local` 和可从 `PATH` 调用的 `redis-server` 后运行：

```bash
npm run lint
npm run format:check
npm test
npm run test:system
```

Web 集成／浏览器测试自动启动带随机认证、随机端口、临时数据目录及随机前缀的专用 Redis，测试进程与 Web 共享该配置。停止 Web 后再清理 Redis，不使用业务 Redis。面板测试覆盖认证、生产静态资源、CSRF、原生管理操作及前端嵌入、错误恢复和会话过期；已有队列与统一启动专项测试仍分别使用自己的专用 Redis。

## 本次记录的待确认项

Bull Board 9.10.5 原版 HTML 引用了 Google Fonts。是否要求字体完全离线尚未确认，本次保留原版资源引用和浏览器字体回退，不修改上游构建产物或新增字体下载流程。
