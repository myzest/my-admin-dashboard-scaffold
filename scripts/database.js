import './load-env.js';
import { createMigrator } from '../database/migrator.js';
import { getDatabase } from '../src/server/database.js';
import { seedAdmin } from '../src/modules/users/server.js';

const command = process.argv[2];
if (!['migrate', 'seed', 'setup'].includes(command)) {
  throw new Error('用法：node scripts/database.js migrate|seed|setup');
}

let database;
try {
  database = getDatabase();
  await database.authenticate();
  if (command !== 'seed') await createMigrator().up();
  if (command !== 'migrate') {
    const result = await seedAdmin();
    console.log(result.created ? '初始管理员已创建。' : '管理员已存在，保留原账号和密码。');
  }
} catch (error) {
  console.error(
    '数据库初始化失败：',
    error.name,
    error.original?.code || error.code || '检查配置和数据库状态',
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
