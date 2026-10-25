import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

async function waitUntil(check) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error('Fixture did not reach the expected state');
}

async function createFixture(context, { web = '', worker = '', startupTimeoutMs } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'admin-starter-application-'));
  await mkdir(path.join(directory, 'scripts'));
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  await symlink(path.join(root, 'src'), path.join(directory, 'src'), 'dir');
  for (const name of ['start.js', 'application-processes.js', 'load-env.js', 'test-config.js']) {
    await copyFile(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  }
  const write = (name, text) => writeFile(path.join(directory, name), text);
  await write('package.json', '{"type":"module"}');
  await write(
    '.env.local',
    'DB_HOST=127.0.0.1\nDB_USER=fixture\nDB_PASSWORD=literal\\$suffix\nSESSION_SECRET=fixture-session-secret-at-least-32-characters\nREDIS_URL=redis://127.0.0.1:6379\nJOB_QUEUE_PREFIX=fixture\n',
  );
  await write('.env.development', 'DB_NAME=development_test\n');
  await write('.env.production', 'DB_NAME=production_test\n');
  const record = (name) => `
    import { writeFileSync } from 'node:fs';
    writeFileSync('${name}.json', JSON.stringify({
      pid: process.pid, mode: process.env.NODE_ENV,
      database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
    }));
    process.on('disconnect', () => process.exit(0));
  `;
  await write(
    'scripts/web.js',
    `${record('web')}
    import { createServer } from 'node:http';
    ${web}
    const port = Number(process.argv.at(-1));
    const server = createServer((req, res) => {
      if (req.headers['x-app-startup-id'] === process.env.APP_STARTUP_ID)
        res.setHeader('X-App-Startup-Id', process.env.APP_STARTUP_ID);
      res.end(JSON.stringify({ status: true, data: { status: 'ok' }, error: {} }));
    });
    server.listen(port, '127.0.0.1');
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    `,
  );
  await write(
    'scripts/worker.js',
    `${record('worker')}
    ${worker}
    process.send({ type: 'ready' });
    setInterval(() => {}, 1000);
    process.on('SIGTERM', () => process.exit(0));
    `,
  );
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  if (startupTimeoutMs) {
    await write(
      'scripts/start.js',
      `import { runApplication } from './application-processes.js';
      try { await runApplication({ mode: 'start', hostname: '127.0.0.1', port: ${port},
        startupTimeoutMs: ${startupTimeoutMs}, shutdownTimeoutMs: 300 }); }
      catch (error) { console.error(error.message); process.exitCode = 1; }`,
    );
  }
  const children = [];
  context.after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    port,
    write,
    read: async (name) => JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8')),
    start(mode = 'start', overrides = {}) {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(DB_|SESSION_|TEST_|JOB_|REDIS_|NODE_ENV$|__NEXT_PROCESSED_ENV$)/.test(key),
        ),
      );
      const child = fork(path.join(directory, 'scripts/start.js'), [mode, '--port', String(port)], {
        cwd: directory,
        execArgv: [],
        env: { ...env, ...overrides },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      children.push(child);
      let output = '';
      child.stdout.on('data', (data) => (output += data));
      child.stderr.on('data', (data) => (output += data));
      return {
        child,
        exited: once(child, 'exit'),
        ready: once(child, 'message'),
        output: () => output,
      };
    },
  };
}

test('application commands align environments, signal readiness and stop both services', async (context) => {
  for (const mode of ['dev', 'start']) {
    await context.test(mode, async (subtest) => {
      const fixture = await createFixture(subtest);
      const app = fixture.start(mode, { NODE_ENV: mode === 'dev' ? 'production' : 'development' });
      assert.equal((await app.ready)[0], 'ready');
      for (const name of ['web', 'worker']) {
        const state = await fixture.read(name);
        assert.equal(state.mode, mode === 'dev' ? 'development' : 'production');
        assert.equal(state.database, `${state.mode}_test`);
        assert.equal(state.password, 'literal$suffix');
      }
      app.child.kill(mode === 'dev' ? 'SIGINT' : 'SIGTERM');
      assert.equal((await app.exited)[0], 0, app.output());
      for (const name of ['web', 'worker']) {
        const { pid } = await fixture.read(name);
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      }
    });
  }
});

test('configuration errors fail before any child starts', async (context) => {
  const fixture = await createFixture(context);
  const app = fixture.start('start', { REDIS_URL: 'not-a-redis-url' });
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /REDIS_URL/);
  await assert.rejects(fixture.read('web'), { code: 'ENOENT' });
  await assert.rejects(fixture.read('worker'), { code: 'ENOENT' });
});

test('startup failures stop the sibling and never report ready', async (context) => {
  const fixture = await createFixture(context, { worker: 'process.exit(17);' });
  const app = fixture.start();
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /worker.*17/);
  assert.doesNotMatch(app.output(), /application-ready/);
});

test('even an unexpected successful exit after readiness stops the whole application', async (context) => {
  const fixture = await createFixture(context, {
    worker: `process.on('SIGUSR2', () => process.exit(0));`,
  });
  const app = fixture.start();
  await app.ready;
  process.kill((await fixture.read('worker')).pid, 'SIGUSR2');
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /worker.*退出：0/);
});

test('a healthy previous listener cannot satisfy readiness for a new application', async (context) => {
  const fixture = await createFixture(context, {
    web: 'await new Promise(() => { setInterval(() => {}, 1000); });',
    startupTimeoutMs: 1000,
  });
  const previous = createServer((req, res) => {
    res.setHeader('X-App-Startup-Id', 'previous-startup');
    res.end(JSON.stringify({ status: true, data: { status: 'ok' }, error: {} }));
  });
  previous.listen(fixture.port, '127.0.0.1');
  await once(previous, 'listening');
  context.after(() => new Promise((resolve) => previous.close(resolve)));
  const app = fixture.start();
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /APPLICATION_START_TIMEOUT.*web/);
  assert.doesNotMatch(app.output(), /application-ready/);
});

test('parent IPC disconnect cleans up services when the supervisor is killed', async (context) => {
  const fixture = await createFixture(context);
  const app = fixture.start();
  await app.ready;
  const states = await Promise.all(['web', 'worker'].map(fixture.read));
  app.child.kill('SIGKILL');
  await app.exited;
  await waitUntil(() =>
    states.every(({ pid }) => {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        return error.code === 'ESRCH';
      }
    }),
  );
});

test('a killed web CLI still has its remaining process group cleaned up', async (context) => {
  const fixture = await createFixture(context, {
    web: `import { fork } from 'node:child_process'; fork('./scripts/descendant.js');`,
  });
  await fixture.write(
    'scripts/descendant.js',
    `import { writeFileSync } from 'node:fs';
    writeFileSync('descendant.json', JSON.stringify({ pid: process.pid }));
    setInterval(() => {}, 1000);`,
  );
  const app = fixture.start();
  await app.ready;
  await waitUntil(async () => {
    try {
      await fixture.read('descendant');
      return true;
    } catch {
      return false;
    }
  });
  const { pid } = await fixture.read('descendant');
  process.kill((await fixture.read('web')).pid, 'SIGKILL');
  assert.equal((await app.exited)[0], 1, app.output());
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('startup cancellation stops pending children without reporting ready', async (context) => {
  const fixture = await createFixture(context, {
    worker: 'await new Promise(() => { setInterval(() => {}, 1000); });',
  });
  const app = fixture.start();
  await waitUntil(async () => {
    try {
      await fixture.read('worker');
      return true;
    } catch {
      return false;
    }
  });
  app.child.kill('SIGINT');
  assert.equal((await app.exited)[0], 0, app.output());
  assert.doesNotMatch(app.output(), /application-ready/);
});

test('a worker shutdown failure is propagated by the supervisor', async (context) => {
  const fixture = await createFixture(context, {
    worker: `process.on('SIGTERM', () => process.exit(17));`,
  });
  const app = fixture.start();
  await app.ready;
  app.child.kill('SIGTERM');
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /worker.*17/);
});

test('Next CLI exit code 143 is accepted during a requested stop', async (context) => {
  const fixture = await createFixture(context, {
    web: `process.on('SIGTERM', () => process.exit(143));`,
  });
  const app = fixture.start();
  await app.ready;
  app.child.kill('SIGTERM');
  assert.equal((await app.exited)[0], 0, app.output());
});

test('a shutdown timeout reports both the original failure and forced cleanup', async (context) => {
  const fixture = await createFixture(context, {
    web: `process.on('SIGUSR2', () => process.exit(17));`,
    startupTimeoutMs: 2000,
  });
  await fixture.write(
    'scripts/worker.js',
    `process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    process.send({ type: 'ready' });`,
  );
  const app = fixture.start();
  await app.ready;
  process.kill((await fixture.read('web')).pid, 'SIGUSR2');
  assert.equal((await app.exited)[0], 1, app.output());
  assert.match(app.output(), /web.*17/);
  assert.match(app.output(), /APPLICATION_STOP_TIMEOUT/);
});

test('shutdown waits for active work and enforces its time limit', async (context) => {
  for (const isStuck of [false, true]) {
    await context.test(isStuck ? 'forced timeout' : 'graceful completion', async (subtest) => {
      const fixture = await createFixture(subtest, { startupTimeoutMs: 2000 });
      await fixture.write(
        'scripts/worker.js',
        `import { writeFileSync } from 'node:fs';
        process.on('SIGTERM', () => {
          if (${isStuck}) return;
          setTimeout(() => {
            writeFileSync('completed.json', 'true'); process.exit(0);
          }, 150);
        });
        setInterval(() => {}, 1000);
        process.send({ type: 'ready' });`,
      );
      const app = fixture.start();
      await app.ready;
      app.child.kill('SIGTERM');
      assert.equal((await app.exited)[0], isStuck ? 1 : 0, app.output());
      if (isStuck) assert.match(app.output(), /APPLICATION_STOP_TIMEOUT/);
      else assert.equal(await fixture.read('completed'), true);
    });
  }
});
