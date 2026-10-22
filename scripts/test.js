import { spawn, fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createTestEnvironment, getTestBuildDirectory } from './test-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
const children = new Set();
let buildDirectory;
let interrupted = false;

function track(child) {
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', () => children.delete(child));
  return child;
}

async function stop(child) {
  if (!children.has(child)) return;
  const closed = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    Promise.all([...children].map(stop)).catch((error) => console.error(error.message));
  });
}

async function run(args, env, server) {
  if (interrupted) throw new Error('测试已取消');
  if (server && (server.exitCode !== null || server.signalCode !== null)) {
    throw new Error('隔离测试服务已退出');
  }
  const child = track(spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' }));
  const completion = once(child, 'exit');
  const [code, signal] = await (server
    ? Promise.race([
        completion,
        once(server, 'exit').then(([code, signal]) => {
          throw new Error(`隔离测试服务意外退出（退出状态 ${code ?? signal}）`);
        }),
      ])
    : completion);
  if (code !== 0) throw new Error(`测试步骤失败（退出状态 ${code ?? signal}）`);
}

async function startServer(env) {
  if (interrupted) throw new Error('测试已取消');
  const child = track(fork(path.join(root, 'scripts/test-server.js'), [], { cwd: root, env }));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('隔离测试服务启动超时')), 60000);
    const onExit = () => finish(new Error('隔离测试服务启动失败'));
    const onError = (error) => finish(error);
    const onMessage = (message) => {
      if (message?.type === 'ready' && Number.isInteger(message.port) && message.port > 0) {
        finish(null, message.port);
      }
    };
    function finish(error, value) {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
      child.off('message', onMessage);
      if (error) reject(error);
      else resolve(value);
    }
    child.once('exit', onExit);
    child.once('error', onError);
    child.on('message', onMessage);
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

try {
  if (!['integration', 'e2e', 'system'].includes(mode) || process.argv.length !== 3) {
    throw new Error('用法：npm run test:integration / test:e2e / test:system');
  }
  const env = createTestEnvironment(path.join(root, '.env.test.local'));
  buildDirectory = path.join(root, getTestBuildDirectory(env.TEST_RUN_ID));
  await mkdir(buildDirectory, { recursive: true });
  await run(['scripts/database.js', 'setup'], env);
  await run([fileURLToPath(import.meta.resolve('next/dist/bin/next')), 'build'], env);

  for (const suite of mode === 'system' ? ['integration', 'e2e'] : [mode]) {
    const server = await startServer(env);
    try {
      const testEnv = { ...env, TEST_BASE_URL: server.baseUrl };
      console.log(`运行 ${suite}：${server.baseUrl}，数据库 ${env.DB_NAME}`);
      if (suite === 'integration') {
        await run(['--test', 'tests/integration/*.test.js'], testEnv, server.child);
      } else {
        await run(
          [fileURLToPath(import.meta.resolve('@playwright/test/cli')), 'test'],
          testEnv,
          server.child,
        );
      }
    } finally {
      await stop(server.child);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode ||= 1;
} finally {
  await Promise.all([...children].map(stop));
  if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true });
}
