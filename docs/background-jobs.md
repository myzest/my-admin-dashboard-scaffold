# 后台任务与定时调度

使用 BullMQ + Redis 保存任务，由独立 Node.js Worker 执行。Next.js 应用、Worker、Redis 分别启动；普通页面和登录不依赖 Redis 是否在线。队列名为 `background`，不同环境通过 `JOB_QUEUE_PREFIX` 隔离。

首个真实任务是 `cleanup-expired-sessions`：按 `Asia/Shanghai` 时区，每小时整点分批清理数据库中的过期会话。每批最多 500 条，每次最多 20 批；返回 `deletedCount`、`batchCount`、`hasMore`。有剩余时由下一次定时或手动运行继续清理。登录已移除同步清理，鉴权仍立即拒绝过期会话；Worker 停止只会延迟清理，不会使过期会话恢复有效。

## 启动

准备 Redis 6.2 或更新版本，本轮使用 Redis 7.2 验证。任务存储应使用持久数据目录，开启 AOF，并设置 `maxmemory-policy noeviction`。开发环境可以在专用目录启动：

```bash
mkdir -p .local/redis-jobs
redis-server --bind 127.0.0.1 --port 6379 --dir "$PWD/.local/redis-jobs" \
  --appendonly yes --appendfsync everysec --maxmemory-policy noeviction
```

仅在该端口空闲时执行。生产使用受访问控制的 Redis 服务、持久卷和备份；容器重建时也必须保留数据。`appendfsync everysec` 在主机突然断电时仍可能丢失约一秒的写入，应按任务的恢复要求选择持久化策略。

在应用的 `.env.local` 或服务管理器环境变量中设置：

```dotenv
REDIS_URL=redis://127.0.0.1:6379/0
JOB_QUEUE_PREFIX=admin-starter-development
JOB_WORKER_CONCURRENCY=1
```

地址必须包含主机名；支持 `rediss://` TLS 连接和 URL 中的认证信息，用户名、密码中的特殊字符需 URL 编码。环境文件中的字面 `$` 遵循项目现有 Next.js 转义规则。开发、测试、生产必须使用不同 Redis 实例或不同前缀，投递方与 Worker 的地址和前缀必须一致。

安装依赖，按数据库文档完成迁移，再在独立终端启动 Worker：

```bash
npm ci
npm run worker
```

Worker 只需要数据库及任务配置，不需要管理员初始密码或 `SESSION_SECRET`。启动时验证数据库连接、连接 Redis，并通过稳定的 scheduler ID 注册或更新定时任务；重复启动不会重复增加调度定义。生产由服务管理器常驻运行，应用发布时同时部署对应 Worker 代码。每个 Worker 使用独立数据库连接池，计算连接预算时要计入 `DB_POOL_MAX`。

命令和 Worker 启动时，每次 Redis 连接就绪检查最多等待 10 秒；超时记录 `JOB_QUEUE_UNAVAILABLE`，关闭资源并以非零状态退出。已建立的连接在 Redis 短暂离线后持续重连；投递方禁用离线请求缓冲，断线投递会报错，调用方需要处理失败并按稳定任务 ID 再次确认或重投。

`SIGINT` / `SIGTERM` 会停止领取新任务，等待当前任务完成，再关闭连接；最多等待 30 秒，超过时退出并由 BullMQ 的锁过期与 stalled 检测恢复任务。启动过程中收到退出信号，也会停止继续注册调度或创建 Worker。任务必须能安全重复执行。

## 手动操作

```bash
# 查看任务定义、各状态数量和定时调度
npm run jobs -- list

# 手动投递，返回任务 ID；不等待执行结束
npm run jobs -- run cleanup-expired-sessions

# 给同一次提交指定稳定 ID，可用于投递响应丢失后的再次确认
npm run jobs -- run cleanup-expired-sessions '{}' cleanup-check-001

# 查询执行状态、尝试次数、结果与失败原因
npm run jobs -- status cleanup-check-001

# 排除故障后，重试已失败的同一任务，重置尝试计数
npm run jobs -- retry cleanup-check-001
```

同一个 `jobId` 在原任务仍保留期间不会创建第二条任务。ID 不应包含冒号，也不能把同一个 ID 用于不同业务参数；超出保留期限后，队列不会继续替它去重。业务幂等必须由处理函数及其数据库约束保证，例如余额沿用已有的 `operationId`。

默认最多尝试 3 次，失败后以 1 秒起步指数退避。未知任务和参数不合法直接失败；处理函数明确抛出 BullMQ `UnrecoverableError` 时也不重试。失败消息存储为固定错误码，Worker 标准错误输出保留错误类型、数据库错误码及任务 ID，不记录 SQL、Cookie、密码或原始参数。

BullMQ 的延迟、等待和限流控制异常保留原有状态流转语义，不会被转换为业务失败，也不消耗失败重试次数。使用这些能力时须遵循 BullMQ 对应的状态迁移方法与异常配对约定。

成功记录最多保留 7 天、1,000 条；失败记录最多保留 30 天、5,000 条，先达到的条件生效。BullMQ 在任务完成／失败时进行惰性清理，保留时间不是精确的删除定时器。这些记录用于任务诊断，业务审计继续使用既有事务内操作日志。

## 增加任务

1. 在所属业务模块实现处理函数，并从该模块的 `server.js` 公开导出；通过 Sequelize 操作数据库。
2. 在 `src/jobs/registry.js` 注册稳定名称、Zod `schema` 和 `run(data, job)`。需要进度时可在任务适配函数里调用 `job.updateProgress()`，业务服务仍接收普通业务参数。
3. 需要定时时增加 `schedule: { pattern: '0 2 * * *', tz: 'Asia/Shanghai' }`；上例每天凌晨 2 点执行。定时参数写在定义的 `data` 中并通过相同 schema 校验。没有 `schedule` 的任务仅手动或由业务入口投递。
4. 重启 Worker 注册新调度；用手动投递验证成功、重试和重复执行，再验证定时触发。

公共队列实现位于 `src/server/job-queue.js`，不导入具体业务模块。注册表负责将调度与业务公开入口连接起来。服务端业务入口创建 Queue 后，先用 `await waitForJobReady(queue)` 检查首次连接，再通过 `createJob(queue, jobDefinitions, name, data, jobId)` 投递。长驻进程复用 Queue，退出或初始化失败时调用 `queue.close()`；浏览器不能连接 Redis，也不能提交任意处理函数或代码路径。

移除定时任务时，先停止旧 Worker，修改注册表，然后显式删除 Redis 中的调度定义，再启动新 Worker：

```bash
npm run jobs -- remove-schedule cleanup-expired-sessions
```

仅删除代码不会删除已持久化的调度；仍含原定义的 Worker 再次启动会重新注册。移除调度不会撤销已经开始执行的任务，旧任务处理函数需保留到存量任务完成。

## 执行语义

- 采用至少一次执行语义。Worker 在业务提交后、任务确认前退出时，处理函数可能再次执行；会话清理通过按过期条件删除实现自然幂等。
- 同一调度 ID 避免重复注册，但不保证处理函数从不重叠。并发数是每个 Worker 的配置；增加实例或并发前，确认业务的锁、幂等和资源限制。
- 停机期间不会按漏掉的每个 cron 时间点补齐所有运行。清理类任务下次执行覆盖剩余记录即可；结算或报表任务需要显式业务周期和补偿逻辑。
- MySQL 事务和 Redis 投递不能原子提交。后续业务若要求“数据库提交后任务一定送达”，应引入同事务 Outbox 和可靠投递器；普通 `afterCommit` 回调不能消除提交后进程退出的窗口。
- 长任务应分批、设置外部请求超时，避免阻塞事件循环影响任务锁续期。任务参数与结果只保存必要业务标识和非敏感统计。

## 验证

按 README 填写独立的 `.env.test.local`，并让 `redis-server` 可从 `PATH` 调用：

```bash
npm run test:jobs
```

入口沿用测试数据库隔离规则，在独立测试库执行迁移；不构建或启动 Next.js。测试自动启动带随机认证、随机端口、临时数据目录及 AOF 的专用 Redis，忽略业务 Redis 配置，并在完成时关闭和清理。不要同时使用同一测试数据库运行其他测试。

测试覆盖 Redis 重启保留任务、原 Queue 断线重连、启动等待超时、重复 ID、多 Worker 消费、失败重试、非法参数、不可重试错误、延迟与限流信号、定时注册去重、后续调度、启动中取消、Worker 被强制终止后的恢复，以及实际 CLI / Worker 对过期会话的分批清理、有效会话保留和正常退出。
