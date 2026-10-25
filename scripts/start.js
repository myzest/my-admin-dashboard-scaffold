import { parseArgs } from 'node:util';
import { runApplication } from './application-processes.js';
import {
  getDatabaseConfig,
  getJobConfig,
  getProxyConfig,
  getSessionConfig,
} from '../src/server/config.js';

try {
  const [mode = 'start', ...args] = process.argv.slice(2);
  if (!['dev', 'start'].includes(mode)) throw new Error('启动模式必须为 dev 或 start');
  const { values } = parseArgs({
    args,
    options: {
      port: { type: 'string', short: 'p' },
      hostname: { type: 'string', short: 'H', default: '127.0.0.1' },
    },
  });

  // Set the mode before loading .env files, including when Baota runs this file directly.
  process.env.NODE_ENV = mode === 'dev' ? 'development' : 'production';
  await import('./load-env.js');
  const port = Number(values.port ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT / --port 必须为 1 到 65535 的整数');
  }
  if (!values.hostname.trim()) throw new Error('--hostname 不能为空');
  getDatabaseConfig();
  getSessionConfig();
  getProxyConfig();
  getJobConfig();

  await runApplication({ mode, hostname: values.hostname, port });
} catch (error) {
  console.error(`[app] 应用启动或运行失败：${error.message}`);
  process.exitCode = 1;
}
