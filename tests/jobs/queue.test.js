import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fork, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { DelayedError, RateLimitError, UnrecoverableError } from 'bullmq';
import {
  createJobQueue,
  createJobWorker,
  createJob,
  waitForJobReady,
  updateJobSchedules,
} from '../../src/server/job-queue.js';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getUserModel } from '../../src/modules/users/models.js';
import { deleteExpiredSessions } from '../../src/modules/auth/server.js';
import { createTestRedis } from '../helpers/redis.js';
import { getTestBuildDirectory } from '../../scripts/test-config.js';

getTestBuildDirectory(process.env.TEST_RUN_ID);
assert.ok(process.env.DB_NAME?.endsWith('_test'));
const execute = promisify(execFile);
const emptySchema = z.object({}).strict();

async function waitUntil(check, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await setTimeout(25);
  }
  throw new Error('Timed out waiting for the job state');
}

function createResources(context, redis) {
  const options = { connection: redis.connection, prefix: `jobs-test-${randomUUID()}` };
  const queue = createJobQueue(options);
  const workers = [];
  context.after(async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await queue.close();
  });
  return {
    options,
    queue,
    environment: { ...process.env, REDIS_URL: redis.url, JOB_QUEUE_PREFIX: options.prefix },
    startWorker(definitions, overrides = {}) {
      const worker = createJobWorker(definitions, { ...options, ...overrides });
      workers.push(worker);
      return worker;
    },
  };
}

test('background jobs use isolated Redis and MySQL', { timeout: 90000 }, async (context) => {
  const redis = await createTestRedis(context);
  context.after(() => getDatabase().close());

  await context.test(
    'queued work survives Redis restart and duplicate IDs execute once',
    async (subtest) => {
      const { options, queue, startWorker } = createResources(subtest, redis);
      let runs = 0;
      const definitions = { sample: { schema: emptySchema, run: async () => ({ runs: ++runs }) } };
      await queue.waitUntilReady();
      await createJob(queue, definitions, 'sample', {}, 'stable-operation');
      await createJob(queue, definitions, 'sample', {}, 'stable-operation');
      assert.equal(await queue.getWaitingCount(), 1);
      await queue.close();
      await redis.stop();
      await redis.start();
      const recoveredQueue = createJobQueue(options);
      subtest.after(() => recoveredQueue.close());
      await recoveredQueue.waitUntilReady();
      startWorker(definitions);
      startWorker(definitions);
      const job = await recoveredQueue.getJob('stable-operation');
      await waitUntil(async () => (await job.getState()) === 'completed');
      assert.equal(runs, 1);
      assert.deepEqual((await recoveredQueue.getJob(job.id)).returnvalue, { runs: 1 });
    },
  );

  await context.test('an existing producer reconnects after a Redis outage', async (subtest) => {
    const { queue } = createResources(subtest, redis);
    await waitForJobReady(queue);
    await queue.add('sample', {}, { jobId: 'before-outage' });
    await redis.stop();
    try {
      await assert.rejects(queue.add('sample', {}, { jobId: 'during-outage' }));
      await setTimeout(750);
    } finally {
      await redis.start();
    }
    await waitUntil(async () => {
      try {
        await queue.getWaitingCount();
        return true;
      } catch {
        return false;
      }
    });
    await queue.add('sample', {}, { jobId: 'after-outage' });
    assert.equal(await queue.getWaitingCount(), 2);
    assert.equal(await queue.getJob('during-outage'), undefined);
  });

  await context.test(
    'unavailable Redis has a bounded startup wait and CLI exits',
    async (subtest) => {
      const unavailable = {
        ...redis,
        connection: { ...redis.connection, password: 'wrong-password' },
      };
      const { queue, environment } = createResources(subtest, unavailable);
      await assert.rejects(waitForJobReady(queue, 100), { code: 'JOB_QUEUE_UNAVAILABLE' });
      const url = new URL(redis.url);
      url.password = 'wrong-password';
      await assert.rejects(
        execute(process.execPath, ['scripts/jobs.js', 'list'], {
          env: { ...environment, REDIS_URL: url.href },
          timeout: 15000,
          killSignal: 'SIGKILL',
        }),
        (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /JOB_QUEUE_UNAVAILABLE/);
          assert.ok(!error.stderr.includes('wrong-password'));
          return true;
        },
      );
    },
  );

  await context.test(
    'transient failures retry, invalid payloads fail once, and failed jobs can be retried',
    async (subtest) => {
      const { queue, startWorker, environment } = createResources(subtest, redis);
      let attempts = 0;
      let hasPermanentFailure = true;
      const definitions = {
        transient: {
          schema: emptySchema,
          run: async () => {
            attempts += 1;
            if (attempts < 3) throw new Error('sensitive SQL / password must not be retained');
            return { attempts };
          },
        },
        permanent: {
          schema: emptySchema,
          run: async () => {
            if (hasPermanentFailure) throw new Error('sensitive failure');
            return { recovered: true };
          },
        },
        rejected: {
          schema: emptySchema,
          run: async () => {
            throw new UnrecoverableError('sensitive rejection');
          },
        },
      };
      await queue.waitUntilReady();
      assert.throws(() => createJob(queue, definitions, 'missing'), /UNKNOWN_JOB/);
      assert.throws(
        () => createJob(queue, definitions, 'transient', { unexpected: true }),
        /INVALID_JOB_DATA/,
      );
      const transient = await createJob(queue, definitions, 'transient');
      const permanent = await createJob(queue, definitions, 'permanent');
      const invalid = await queue.add('transient', { unexpected: true });
      const unknown = await queue.add('missing', {});
      const rejected = await createJob(queue, definitions, 'rejected');
      startWorker(definitions, { concurrency: 2 });
      await waitUntil(async () => (await transient.getState()) === 'completed');
      await waitUntil(async () => (await permanent.getState()) === 'failed');
      assert.equal((await queue.getJob(transient.id)).attemptsMade, 3);
      for (const job of [invalid, unknown, rejected]) {
        await waitUntil(async () => (await job.getState()) === 'failed');
        assert.equal((await queue.getJob(job.id)).attemptsMade, 1);
      }
      const failed = await queue.getJob(permanent.id);
      assert.equal(failed.attemptsMade, 3);
      assert.equal(failed.failedReason, 'JOB_EXECUTION_FAILED');
      assert.ok(failed.stacktrace.every((stack) => !stack.includes('sensitive')));
      assert.equal((await queue.getJob(rejected.id)).failedReason, 'JOB_REJECTED');
      hasPermanentFailure = false;
      await execute(process.execPath, ['scripts/jobs.js', 'retry', permanent.id], {
        env: environment,
      });
      await waitUntil(async () => (await permanent.getState()) === 'completed');
      assert.equal((await queue.getJob(permanent.id)).attemptsMade, 1);
    },
  );

  await context.test(
    'BullMQ delay and rate limit signals do not consume retries',
    async (subtest) => {
      const { queue, startWorker } = createResources(subtest, redis);
      const runs = { delayed: 0, limited: 0 };
      const errors = [];
      const definitions = {
        delayed: {
          schema: emptySchema,
          run: async (_, job) => {
            if (++runs.delayed === 1) {
              await job.moveToDelayed(Date.now() + 150, job.token);
              throw new DelayedError();
            }
            return { resumed: true };
          },
        },
        limited: {
          schema: emptySchema,
          run: async () => {
            if (++runs.limited === 1) {
              await worker.rateLimit(150);
              throw new RateLimitError();
            }
            return { resumed: true };
          },
        },
      };
      const worker = startWorker(definitions);
      worker.on('error', (error) => errors.push(error));
      worker.on('failed', (_, error) => errors.push(error));
      await waitForJobReady(queue);
      for (const name of Object.keys(definitions)) {
        const job = await createJob(queue, definitions, name);
        await waitUntil(async () => (await job.getState()) === 'completed');
        assert.equal((await queue.getJob(job.id)).attemptsMade, 1);
        assert.equal(runs[name], 2);
      }
      assert.deepEqual(errors, []);
    },
  );

  await context.test(
    'schedule registration is repeatable and creates future executions',
    async (subtest) => {
      const { queue, startWorker } = createResources(subtest, redis);
      let runs = 0;
      const definitions = {
        scheduled: {
          schema: emptySchema,
          schedule: { every: 150 },
          run: async () => ({ runs: ++runs }),
        },
      };
      await queue.waitUntilReady();
      await Promise.all([
        updateJobSchedules(queue, definitions),
        updateJobSchedules(queue, definitions),
      ]);
      assert.equal(await queue.getJobSchedulersCount(), 1);
      const worker = startWorker(definitions);
      await waitUntil(() => runs >= 2);
      await worker.close();
      await updateJobSchedules(queue, definitions);
      assert.equal(await queue.getJobSchedulersCount(), 1);
      const previous = runs;
      startWorker(definitions);
      await waitUntil(() => runs > previous);
      await queue.removeJobScheduler('scheduled');
      assert.equal(await queue.getJobSchedulersCount(), 0);
    },
  );

  await context.test(
    'shutdown during startup does not register schedules or start a worker',
    async (subtest) => {
      const { queue, environment } = createResources(subtest, redis);
      const { stdout, stderr } = await execute(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { setTimeout } from 'node:timers/promises';
        globalThis.adminStarterDatabase = {
          authenticate: async () => { process.emit('SIGTERM'); await setTimeout(20); },
          close: async () => { await setTimeout(500); },
        };
        await import('./scripts/worker.js');
        `,
        ],
        { env: environment, timeout: 5000, killSignal: 'SIGKILL' },
      );
      assert.ok(!stdout.includes('worker-ready'), stdout);
      assert.equal(stderr, '');
      await waitForJobReady(queue);
      assert.equal(await queue.getJobSchedulersCount(), 0);
    },
  );

  await context.test(
    'a killed worker leaves recoverable work for the next worker',
    async (subtest) => {
      const { options, queue, startWorker } = createResources(subtest, redis);
      const workerOptions = { ...options, lockDuration: 600, stalledInterval: 250 };
      const child = fork(new URL('../helpers/job-worker.js', import.meta.url), [], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      subtest.after(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      });
      const ready = once(child, 'message');
      child.send(workerOptions);
      assert.equal((await ready)[0].type, 'ready');
      await queue.waitUntilReady();
      const active = once(child, 'message');
      const job = await queue.add('recover', {});
      assert.equal((await active)[0].type, 'active');
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
      startWorker(
        { recover: { schema: emptySchema, run: async () => ({ recovered: true }) } },
        workerOptions,
      );
      await waitUntil(async () => (await job.getState()) === 'completed');
      assert.deepEqual((await queue.getJob(job.id)).returnvalue, { recovered: true });
    },
  );

  await context.test(
    'the real CLI and worker clean expired sessions in bounded batches and shut down cleanly',
    async (subtest) => {
      const { queue, environment } = createResources(subtest, redis);
      const User = getUserModel();
      const Session = getSessionModel();
      const account = await User.create({
        username: `jobs_${randomUUID().slice(0, 8)}`,
        passwordHash: 'unused-test-fixture',
      });
      subtest.after(() => account.destroy());
      const expiredIds = [randomUUID(), randomUUID(), randomUUID()];
      const activeId = randomUUID();
      await Session.bulkCreate([
        ...expiredIds.map((id) => ({ id, userId: account.id, expiresAt: new Date(0) })),
        { id: activeId, userId: account.id, expiresAt: new Date(Date.now() + 3600000) },
      ]);
      const batch = await deleteExpiredSessions({ batchSize: 2, maxBatches: 1 });
      assert.equal(batch.deletedCount, 2);
      assert.equal(batch.hasMore, true);
      assert.ok(await Session.findByPk(activeId));

      const child = fork('scripts/worker.js', [], {
        execArgv: [],
        env: { ...environment, SESSION_SECRET: '' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      let output = '';
      child.stdout.on('data', (data) => {
        output = (output + data).slice(-4000);
      });
      child.stderr.on('data', (data) => {
        output = (output + data).slice(-4000);
      });
      subtest.after(async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        const [code] = await exited;
        assert.equal(code, 0, output);
      });
      await waitUntil(() => {
        assert.equal(child.exitCode, null, output);
        return output.includes('worker-ready');
      });
      const { stdout } = await execute(
        process.execPath,
        ['scripts/jobs.js', 'run', 'cleanup-expired-sessions', '{}', 'manual-cleanup'],
        { env: environment },
      );
      assert.equal(JSON.parse(stdout).id, 'manual-cleanup');
      const job = await queue.getJob('manual-cleanup');
      await waitUntil(async () => (await job.getState()) === 'completed');
      for (const id of expiredIds) assert.equal(await Session.findByPk(id), null);
      assert.ok(await Session.findByPk(activeId));
      assert.equal((await deleteExpiredSessions()).deletedCount, 0);
      const status = await execute(process.execPath, ['scripts/jobs.js', 'status', job.id], {
        env: environment,
      });
      assert.equal(JSON.parse(status.stdout).result.hasMore, false);
      const schedules = await queue.getJobSchedulers();
      assert.equal(schedules.length, 1);
      assert.equal(schedules[0].pattern, '0 * * * *');
      assert.equal(schedules[0].tz, 'Asia/Shanghai');
    },
  );
});
