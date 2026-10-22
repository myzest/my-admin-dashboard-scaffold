# 数据库迁移

改 Sequelize 模型不会自动修改数据库。结构变化通过 `database/migrations/` 中按文件名排序的迁移执行，已执行记录保存在 `sequelize_meta`。

## 日常改字段

1. 修改所属模块的模型、校验和接口；涉及界面时一起调整。
2. 新建下一个编号的迁移，例如 `005-user-phone.js`，不要修改已执行的 `001` / `002` / `003` / `004`。
3. 在独立 MySQL 测试库验证全新初始化、已有数据升级和重复执行。
4. 发布前备份数据库，停止应用写入，由一个部署进程运行 `npm run db:migrate`，再启动对应版本并检查数据。

例如，为用户增加可选电话字段：

```js
import { DataTypes } from 'sequelize';

export async function up(queryInterface) {
  const columns = await queryInterface.describeTable('users');
  if (!columns.phone) {
    await queryInterface.addColumn('users', 'phone', {
      type: DataTypes.STRING(32),
      allowNull: true,
    });
  }
}
```

模型同时增加 `phone: { type: DataTypes.STRING(32), allowNull: true }`。这是操作示例，本项目没有加入电话业务。

已有数据新增必填字段时，先增加可空字段或默认值，填充历史数据后再加约束。改名、删字段先确认旧代码已不再依赖；不要用删除重建表代替迁移。

## 命令

| 命令                 | 用途                                     |
| -------------------- | ---------------------------------------- |
| `npm run db:migrate` | 只执行未完成的迁移                       |
| `npm run db:seed`    | 缺少管理员时创建初始账号，已有账号不重置 |
| `npm run db:setup`   | 依次执行迁移和初始管理员创建             |

MySQL 的 DDL 会自动提交，不能把迁移失败当作已全部回滚。迁移要允许从中断处继续；失败时停止发布，核对实际表结构后重试。发生破坏性变更时按备份恢复，不提供一键清库或自动回滚命令。不使用 `sync({ alter: true })` / `sync({ force: true })`。

## 从仅管理员版本升级

`002-users-balances-settings.js` 将原管理员和会话结构升级为统一账号与会话表，保留账号编号、密码哈希和分类数据，再增加注册设置、余额和日志。原管理员仍是管理员；余额从 `0.0000` 开始，注册默认关闭。

先备份并停旧服务，执行 `npm run db:migrate`，部署新版本。Cookie 名改为 `starter_session`，升级后浏览器需要重新登录，原账号密码不变。

首版只验收 MySQL。PostgreSQL / SQLite 的迁移和事务行为需另行验证。

## 从双角色版本升级

`003-user-status.js` 为 `users` 增加 `is_enabled`，默认 `true`。已有账号自动保持启用，编号、密码、余额和日志不变。该迁移允许 DDL 提交后中断重试，不会将已停用账号重新启用。

发布前备份并停止旧服务，运行 `npm run db:migrate` 后部署新代码。只修改模型不能替代迁移。

## 操作日志升级

`004-operation-logs.js` 新增管理员操作日志表与查询索引，不改已有账号或余额。用户关联操作日志通过外键随硬删除清理；匿名删除事件不关联被删除用户。该迁移逐项检查表和索引，允许 MySQL 建表或建索引已提交、迁移记录尚未写入时继续执行，不清空已有日志。

升级到包含操作日志的代码前，先按上述流程执行迁移；仅启动新代码不会自动建表。

## 验证迁移

先按 README 的“验证”填写 `.env.test.local`。迁移测试使用其中的测试数据库连接和账号配置，不读取业务 `.env.local`，也不继承终端中的其他 `DB_*` 配置。

在同一个测试 MySQL 实例创建并授权一个空的专用数据库，名字以 `_migration_test` 结尾，然后显式指定目标库：

```bash
DB_NAME=admin_starter_migration_test node --test tests/migrations/upgrade.test.js
```

测试覆盖全新初始化、已有账号/会话/分类保留、重复执行不重置余额，以及多处 DDL 提交后中断重试。非空库会拒绝执行；成功用例清理自己的表，失败用例保留现场供排查。
