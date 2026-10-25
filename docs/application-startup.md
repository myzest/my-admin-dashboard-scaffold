# 统一启动与宝塔部署

项目使用一个入口管理 Next.js Web 和 BullMQ Worker。两个服务分别运行在独立进程中，日常只启动、停止一个项目。MySQL 和 Redis 由外部服务管理；启动入口不执行迁移、初始化或生产构建。

## 开发与生产命令

按 [README](../README.md#本地启动) 安装依赖、填写配置、初始化数据库，并准备持久 Redis 后：

```bash
# 开发：Next.js 热更新与后台 Worker
npm run dev

# 生产：先构建，再启动 Web 与 Worker
npm run build
npm run start
```

默认监听 `127.0.0.1:3000`。端口支持 `PORT` 环境变量和命令行参数，参数优先；监听地址通过参数设置：

```bash
npm run dev -- --port 3100
npm run start -- --hostname 127.0.0.1 --port 3100

# 宝塔直接运行启动文件时，省略模式也默认为 start
node scripts/start.js start --port 3100
```

支持 `-p` / `--port`、`-H` / `--hostname`。入口显式传递端口给 Next.js；端口占用会失败，不会自动换到下一端口。

`dev` 强制使用 `NODE_ENV=development`，`start` 强制使用 `NODE_ENV=production`；两者复用现有 `@next/env` 按 Next.js 的规则加载环境文件，Web 与 Worker 继承一致的启动配置。其他配置仍以已设置的进程环境变量优先，普通 `.env*` 中的字面 `$` 写成 `\$`。维护命令默认 production；使用 `.env.development*` 的数据库时，也应以 `NODE_ENV=development` 执行相应维护命令。独立测试配置使用 `dotenv.parse`，不展开环境变量；项目不自行实现环境文件解析器。

开发和生产使用独立的 Redis 或 `JOB_QUEUE_PREFIX`，投递命令与 Worker 必须使用同一地址和前缀。`DB_POOL_MAX` 是每个进程的上限，连接预算需计入 Web 与 Worker 两份连接池。

Next.js 页面和 API 保留原有开发热更新；Worker 不使用 Next.js 热更新。修改任务处理代码、注册表或任何 `.env*` 配置后，停止并重新运行统一命令，确保两个进程重新加载同一份配置。

## 就绪、失败与停止

入口先验证数据库、会话、代理和队列配置，再启动两个服务：

1. Web 的 `/health` 必须返回成功 JSON，并返回与本次启动匹配的内部响应头，避免把旧实例误判为新服务。
2. Worker 验证数据库连接、连接 Redis、注册或更新调度并开始消费后，通过 IPC 通知就绪。
3. 两者全部就绪，入口输出 `application-ready`，并向 PM2 发送 `ready`。

Next.js 的 `Ready` 或 Worker 的 `worker-ready` 日志只代表对应服务。整体就绪日志示例：

```json
{ "event": "application-ready", "mode": "start", "hostname": "127.0.0.1", "port": 3000 }
```

Web 与 Worker 日志分别带 `[web]`、`[worker]` 前缀，统一入口失败信息带 `[app]`。生产启动总等待上限为 60 秒，开发为 120 秒；超时会输出 `APPLICATION_START_TIMEOUT` 和未就绪服务名，停止两者并非零退出。Worker 各次 Redis 首次连接检查仍最多等待 10 秒，超时记录 `JOB_QUEUE_UNAVAILABLE`。

配置错误、启动失败，或就绪后任一被管理服务进程意外退出，都会结束整个应用；意外退出码为 0 也按失败处理。生产自动重启交给宝塔／PM2。单个任务失败继续按 BullMQ 规则重试；启动完成后 Redis 短暂断线继续重连，普通页面和登录不增加 Redis 查询依赖。

在终端按 `Ctrl+C`，或由宝塔／PM2 停止项目，会向两者发送停止请求。Worker 停止领取任务并等待当前任务完成，最多 30 秒；统一入口在 31 秒后强制结束仍存活的子进程组，记录 `APPLICATION_STOP_TIMEOUT` 并非零退出。正常收尾可退出 0，子进程收尾失败也会使整体非零退出并报错。任务被中断后仍依靠 BullMQ 锁过期和 stalled 检测恢复，业务处理函数必须幂等。

公开 `GET /health` 的 JSON 仍为 `{ "status": true, "data": { "status": "ok" }, "error": {} }`，用于 Web 存活检查；它不查询 Redis 或 Worker，也不表示后台任务持续健康。启动标记响应头仅在本次受控探测中返回。

## 宝塔与 PM2

生产使用单实例 `fork`。先准备数据库与持久 Redis，执行 `npm ci` 并填写运行配置，按数据库文档完成首次初始化或发布迁移，再执行 `npm run build`。后续升级仍需先备份、由单个进程迁移，再部署对应代码；见 [数据库迁移](database-migrations.md)。

仓库提供 `ecosystem.config.cjs`。面板支持导入 PM2 配置时使用该文件；使用服务器 PM2 命令时，在项目目录执行：

```bash
pm2 start ecosystem.config.cjs
pm2 logs admin-starter

# 后续发布完成后重启，重新读取环境变量
pm2 restart admin-starter --update-env

# 停止整个项目
pm2 stop admin-starter
```

宝塔以“启动文件”管理 Node 项目时，填写项目内的 `scripts/start.js`，工作目录使用项目根目录，参数为 `start`。PM2 的 `wait_ready` 需要直接管理这个文件，才能通过 IPC 收到整体就绪通知；经由 npm 中间进程启动时，不能依赖该通知。终端仍使用 `npm run start`。不要直接填写 Next.js CLI，否则会绕过 Worker 和统一生命周期管理。

核对面板实际使用以下参数：

| 参数                            | 值              | 作用                                         |
| ------------------------------- | --------------- | -------------------------------------------- |
| `exec_mode` / `instances`       | `fork` / `1`    | 一个入口管理一组 Web 与 Worker               |
| `treekill`                      | `false`         | PM2 只通知统一入口，由入口协调子进程停止     |
| `wait_ready`                    | `true`          | 接收整个应用的就绪通知                       |
| `listen_timeout`                | `65000`         | PM2 的启动等待设置，略长于入口 60 秒启动上限 |
| `kill_timeout`                  | `35000`         | 给 Worker 30 秒和入口 31 秒清理留出余量      |
| `autorestart` / `restart_delay` | `true` / `5000` | 意外退出后重启，持续失败时避免高速循环       |
| `watch`                         | `false`         | 生产通过明确的发布、重启流程更新             |

PM2 的 `listen_timeout` 不是“超时一定启动失败”的保证；实际失败由统一入口自己的计时器处理。面板显示 `online` 也不能替代 `application-ready` 日志与实际任务验证。不要同时由面板和另一份 PM2 进程管理器重复拉起同一项目。

`treekill: false` 必须生效。PM2 默认会向整个进程树发送 `SIGINT`，绕过统一入口的停止协调；Next.js 可能因此返回 130，被误报为停止失败。由入口独自负责向 Web 与 Worker 转发 `SIGTERM`，才能保持一致的收尾流程。

运行统一入口后无需再执行 `npm run worker`。该命令保留用于单独排障或有计划的消费者扩容；额外运行会增加任务并发和数据库连接。多应用实例、PM2 cluster 和 Worker 自动扩容不属于本次部署方案。

## 验证与已记录边界

基础检查：

```bash
npm run lint
npm run format:check
npm test
```

按 README 配置独立 `.env.test.local`，并确保 `redis-server` 在 `PATH` 后：

```bash
# 隔离构建及真实 Web / Worker 启停、故障、任务消费验证
npm run test:startup

# 任务重试、持久化、调度和会话清理回归
npm run test:jobs
```

启动验证使用随机端口和专用临时 Redis，并清理本次构建目录；MySQL 仍需按 README 准备独立测试库。API 回归使用 `npm run test:integration`。这些入口不代表已验证目标宝塔服务器的进程管理行为。

目标服务器应在隔离数据库和 Redis 上核验：

1. 从宝塔启动后观察到 `application-ready`，页面可访问，手动投递 `cleanup-expired-sessions` 后能查询完成状态。
2. 重启后定时调度不重复增加，旧进程和旧端口监听已退出。
3. 配置错误、端口占用或 Redis 启动不可用时，整体失败并显示原因；故障持续时重启间隔生效。
4. 停止与重启能让正在执行的任务收尾，超时按既定上限结束，没有残留 Web 或 Worker。

实际宝塔面板与 Node 项目管理器版本，以及上述 PM2 参数能否配置并生效，仍需在目标服务器核验。本轮进程组管理面向 Linux / macOS，Windows 尚未验证。

当前 Next.js 开发 CLI 的内部 HTTP 子进程若被单独 `SIGKILL`，CLI 可能仍存活；本次没有增加运行中持续健康探测，仅靠被管理 CLI 的退出事件不能发现该场景。生产 `next start` 在被管理进程内运行 Web，不存在这一额外 CLI 子进程层级。
