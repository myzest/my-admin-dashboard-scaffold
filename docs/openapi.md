# OpenAPI 契约示例

首版只提供一个开放接口示例：`GET /health`。它无需登录，返回应用存活状态，使用现有的业务响应格式：

```json
{ "status": true, "data": { "status": "ok" }, "error": {} }
```

可以通过 `curl http://127.0.0.1:3000/health` 调用。成功返回 HTTP 200，不支持的方法返回 HTTP 405 和 `Allow: GET`，响应包含 `X-Request-Id` 并禁止缓存。统一 API 响应不生成 ETag，携带 `If-None-Match` 也不会把正常响应或错误响应改为空体 304。

这个接口是存活检查：不会查询 MySQL、Redis 或 Worker，不用于判断依赖是否就绪。Next.js 通过 rewrite 将 `/health` 映射到 `pages/api/health.js`。

## 查看与导出

管理员登录后，在侧栏进入“接口文档”（`/admin/api-docs`），查看响应结构、调用示例并下载标准 OpenAPI JSON。页面复用管理员权限守卫，普通用户和访客不能访问。文档使用本地依赖 Scalar 渲染，只在文档页面加载；请求直接发送到当前部署地址。

也可以在命令行生成契约文件：

```bash
npm run openapi:generate
```

生成结果为 `docs/openapi.json`，可导入 Apifox、Postman 等支持 OpenAPI 3.1 的工具。文件中的服务器地址 `/` 表示当前部署；导入外部工具后，将服务器地址设置为实际应用地址。生成命令只读取契约，不需要数据库、Redis 或会话配置。

`openapi.json` 是标准 OpenAPI 文档本身，不套用业务响应中的 `{ status, data, error }`；文档描述的 `/health` 接口仍遵循该业务响应格式。

## 扩展与兼容

- 契约源文件为 `src/modules/openapi/server.js`，响应 Schema 使用 Zod，OpenAPI Schema 通过 `z.toJSONSchema` 生成。修改契约后重新运行生成命令，不手改生成文件。
- 当前示例没有输入参数。后续增加业务接口时，复用所属模块的 Zod 输入规则，按输入模式转换；自定义 `refine`、字符串规范化等规则仍需描述和实际接口测试，生成成功不等于能完整表达运行时语义。
- `info.version` 是接口契约版本，当前为 `1.0.0`。新增兼容字段可更新小版本；移除字段、改变类型、状态码或认证要求前，应先设计新版本与调用方迁移方案。
- 本轮只描述 `/health`，未把现有管理端与用户端 API 声明为开放接口。第三方业务调用的凭证、权限范围和调用限制，在具体业务接口接入时再确定。

## 验证

`npm test` 检查生成文件与契约源是否一致；`npm run test:system` 在独立测试环境验证实际响应、条件请求、方法限制、文档页面权限，以及在线调试、桌面和移动端的文档展示与下载。条件请求使用原生 HTTP 客户端，避免 `fetch` 自动补充 `Cache-Control: no-cache` 掩盖 304 问题。测试环境配置沿用 README。
