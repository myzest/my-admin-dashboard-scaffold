import './load-env.js';
import { input, password } from '@inquirer/prompts';
import { loginSchema, resetAdminPassword } from '../src/modules/auth/server.js';
import { passwordSchema } from '../src/modules/users/server.js';
import { getDatabase } from '../src/server/database.js';
import { HttpError } from '../src/server/errors.js';

const isInteractive = process.stdin.isTTY && process.stdout.isTTY && process.argv.length === 2;
let database;

try {
  if (!isInteractive) {
    throw new Error(
      '请在交互式终端运行 npm run admin:reset-password，不要通过参数或管道传入密码。',
    );
  }
  console.log('重置已有管理员密码；成功后，该账号的全部登录会话立即失效。');
  const username = await input({
    message: '管理员用户名：',
    validate: (value) => {
      const result = loginSchema.shape.username.safeParse(value);
      return result.success || result.error.issues[0].message;
    },
  });
  const newPassword = await password({
    message: '新密码：',
    validate: (value) => {
      const result = passwordSchema.safeParse(value);
      return result.success || result.error.issues[0].message;
    },
  });
  await password({
    message: '再次输入新密码：',
    validate: (value) => value === newPassword || '两次密码不一致',
  });
  database = getDatabase();
  await resetAdminPassword(username, { newPassword });
  console.log('管理员密码已重置，旧会话已撤销。');
} catch (error) {
  if (error.name === 'ExitPromptError') {
    console.error('已取消，密码未修改。');
  } else if (error instanceof HttpError) {
    console.error(
      error.code === 'USER_NOT_FOUND' ? '管理员不存在，未修改任何账号。' : error.message,
    );
  } else if (!isInteractive) {
    console.error(error.message);
  } else {
    console.error('重置失败，请检查数据库配置与迁移状态。', error.original?.code || error.name);
  }
  process.exitCode = 1;
} finally {
  await database?.close();
}
