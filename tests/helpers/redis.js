import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function createTestRedis(context, { handleSignals = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'admin-starter-redis-'));
  const portServer = createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const password = randomUUID();
  let child;

  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }

  async function start() {
    child = spawn(
      'redis-server',
      [
        '--bind',
        '127.0.0.1',
        '--port',
        String(port),
        '--dir',
        directory,
        '--requirepass',
        password,
        '--appendonly',
        'yes',
        '--appendfsync',
        'always',
        '--save',
        '',
        '--maxmemory-policy',
        'noeviction',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error('Isolated Redis startup timed out')), 10000);
      const onExit = () => finish(new Error(`Isolated Redis exited: ${output}`));
      const onError = (error) => finish(error);
      const onData = (data) => {
        output = (output + data).slice(-4000);
        if (/ready to accept connections/i.test(output)) finish();
      };
      function finish(error) {
        clearTimeout(timer);
        child.off('exit', onExit);
        child.off('error', onError);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        if (error) reject(error);
        else resolve();
      }
      child.once('exit', onExit);
      child.once('error', onError);
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
    });
    child.stdout.resume();
    child.stderr.resume();
  }

  context.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  });
  function interrupt() {
    void stop().finally(() => process.exit(1));
  }
  if (handleSignals) {
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
  }
  await start();
  return {
    connection: { host: '127.0.0.1', port, password },
    url: `redis://:${password}@127.0.0.1:${port}/0`,
    start,
    stop,
  };
}
