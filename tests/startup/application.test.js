import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { getTestBuildDirectory } from '../../scripts/test-config.js';
import { createJobQueue, waitForJobReady } from '../../src/server/job-queue.js';
import { createTestRedis } from '../helpers/redis.js';

getTestBuildDirectory(process.env.TEST_RUN_ID);
assert.ok(process.env.DB_NAME?.endsWith('_test'));

async function waitUntil(check, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error('Timed out waiting for the application');
}

async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function startApplication(context, env, mode = 'start', occupiedPort) {
  let port = occupiedPort;
  if (!port) {
    const reservation = await reservePort();
    port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
  }
  const child = fork('scripts/start.js', [mode, '--port', String(port)], {
    env,
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  let output = '';
  let isReady = false;
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  child.on('message', (message) => {
    if (message === 'ready') isReady = true;
  });
  const stop = async (signal = 'SIGTERM') => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    return exited;
  };
  context.after(() => stop());
  return {
    child,
    exited,
    stop,
    url: `http://127.0.0.1:${port}`,
    output: () => output,
    processes: () =>
      Object.fromEntries(
        [...output.matchAll(/\{"event":"service-started",[^\n]+\}/g)].map(([line]) => {
          const { name, pid } = JSON.parse(line);
          return [name, pid];
        }),
      ),
    async ready() {
      await waitUntil(() => {
        assert.equal(child.exitCode, null, output);
        assert.equal(child.signalCode, null, output);
        return isReady;
      }, 60000);
    },
  };
}

function isGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code === 'ESRCH') return true;
    throw error;
  }
}

test(
  'real Next CLI and Worker share the application lifecycle',
  { timeout: 180000 },
  async (context) => {
    let queue;
    // Node runs after hooks in registration order; close clients before stopping Redis.
    context.after(() => queue?.close());
    const redis = await createTestRedis(context);
    const prefix = `startup-test-${randomUUID()}`;
    const env = { ...process.env, REDIS_URL: redis.url, JOB_QUEUE_PREFIX: prefix };
    queue = createJobQueue({ connection: redis.connection, prefix });
    await waitForJobReady(queue);

    await context.test(
      'production readiness, task processing and restart preserve one schedule',
      async (subtest) => {
        for (let run = 0; run < 2; run += 1) {
          const app = await startApplication(subtest, env);
          await app.ready();
          const response = await fetch(`${app.url}/health`);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('x-app-startup-id'), null);
          assert.deepEqual(await response.json(), {
            status: true,
            data: { status: 'ok' },
            error: {},
          });
          const job = await queue.add('cleanup-expired-sessions', {}, { jobId: `startup-${run}` });
          await waitUntil(async () => (await job.getState()) === 'completed');
          assert.equal(typeof (await queue.getJob(job.id)).returnvalue.deletedCount, 'number');
          assert.equal(await queue.getJobSchedulersCount(), 1);
          assert.equal((await app.stop())[0], 0, app.output());
          for (const pid of Object.values(app.processes())) assert.ok(isGone(pid), app.output());
        }
      },
    );

    await context.test(
      'Redis startup failure terminates the web process and reports the cause',
      async (subtest) => {
        const unavailable = new URL(redis.url);
        unavailable.password = 'startup-wrong-password';
        const app = await startApplication(subtest, { ...env, REDIS_URL: unavailable.href });
        assert.equal((await app.exited)[0], 1, app.output());
        assert.match(app.output(), /JOB_QUEUE_UNAVAILABLE/);
        assert.doesNotMatch(app.output(), /application-ready|startup-wrong-password/);
        for (const pid of Object.values(app.processes())) assert.ok(isGone(pid));
      },
    );

    await context.test(
      'an occupied port fails the entire application without changing ports',
      async (subtest) => {
        const occupied = await reservePort();
        subtest.after(() => new Promise((resolve) => occupied.close(resolve)));
        const app = await startApplication(subtest, env, 'start', occupied.address().port);
        assert.equal((await app.exited)[0], 1, app.output());
        assert.match(app.output(), /EADDRINUSE/);
        assert.doesNotMatch(app.output(), /application-ready/);
      },
    );

    await context.test('a production web crash stops the worker', async (subtest) => {
      const app = await startApplication(subtest, env);
      await app.ready();
      const pids = app.processes();
      assert.ok(pids.web && pids.worker);
      process.kill(pids.web, 'SIGKILL');
      assert.equal((await app.exited)[0], 1, app.output());
      assert.ok(isGone(pids.worker));
    });

    await context.test(
      'losing the supervisor closes the real production services through IPC',
      async (subtest) => {
        const app = await startApplication(subtest, env);
        await app.ready();
        const pids = Object.values(app.processes());
        assert.equal(pids.length, 2);
        await app.stop('SIGKILL');
        await waitUntil(() => pids.every(isGone));
        await assert.rejects(fetch(`${app.url}/health`));
      },
    );

    await context.test(
      'development serves pages, stops gracefully and cleans its CLI descendants',
      async (subtest) => {
        const runId = randomUUID();
        const buildDirectory = getTestBuildDirectory(runId);
        // Parent cleanup runs after all child application stop hooks, including failed tests.
        context.after(() => rm(buildDirectory, { recursive: true, force: true }));
        const app = await startApplication(subtest, { ...env, TEST_RUN_ID: runId }, 'dev');
        await app.ready();
        assert.equal((await fetch(`${app.url}/login`)).status, 200);
        const job = await queue.add('cleanup-expired-sessions', {}, { jobId: 'development' });
        await waitUntil(async () => (await job.getState()) === 'completed');
        assert.equal((await app.stop('SIGINT'))[0], 0, app.output());
        await assert.rejects(fetch(`${app.url}/health`));

        const restarted = await startApplication(subtest, { ...env, TEST_RUN_ID: runId }, 'dev');
        await restarted.ready();
        const pids = restarted.processes();
        process.kill(pids.web, 'SIGKILL');
        assert.equal((await restarted.exited)[0], 1, restarted.output());
        assert.ok(isGone(pids.worker));
        await assert.rejects(fetch(`${restarted.url}/health`));
      },
    );
  },
);
