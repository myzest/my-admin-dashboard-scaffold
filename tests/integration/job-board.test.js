import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { text } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDatabase } from '../../src/server/database.js';
import { createJobQueue, createJobWorker, waitForJobReady } from '../../src/server/job-queue.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getUserModel } from '../../src/modules/users/models.js';
import { baseUrl } from '../helpers/api.js';
import { createSessionCookie } from '../helpers/session.js';

const BOARD_PATH = '/api/admin/bull-board';
const QUEUE_PATH = '/api/queues/background';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '面板测试必须使用独立测试数据库');
assert.ok(process.env.JOB_QUEUE_PREFIX?.startsWith('web-test-'), '面板测试必须使用隔离 Redis');
assert.equal(new URL(process.env.REDIS_URL).hostname, '127.0.0.1');

async function waitForState(job, state) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if ((await job.getState()) === state) return;
    await setTimeout(25);
  }
  assert.fail(`Job ${job.id} did not reach ${state}`);
}

test(
  'Bull Board preserves native administrator controls behind the application session',
  {
    timeout: 90000,
  },
  async (context) => {
    const database = getDatabase();
    const User = getUserModel();
    const Session = getSessionModel();
    const queue = createJobQueue();
    const workers = [];
    const userIds = [];
    const suffix = randomUUID().slice(0, 8);
    let adminCookie;
    let csrfToken;
    let csrfCookie;

    function requestBoard(
      path,
      { method = 'GET', cookie = adminCookie, token = csrfToken, body, raw, headers = {} } = {},
    ) {
      return fetch(`${baseUrl}${BOARD_PATH}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(token && method !== 'GET' ? { 'x-xsrf-token': token } : {}),
          ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body ?? {}) }),
      });
    }

    async function writeBoard(path, { method = 'PUT', body, status = 200 } = {}) {
      const response = await requestBoard(path, { method, body });
      assert.equal(response.status, status, `${method} ${path}`);
      return status === 204 ? undefined : response.json();
    }

    async function requestConditional(path, cookie = adminCookie) {
      // fetch adds Cache-Control: no-cache for validators and would conceal Next's 304 behavior.
      const req = request(`${baseUrl}${BOARD_PATH}${path}`, {
        headers: { 'If-None-Match': '*', ...(cookie ? { Cookie: cookie } : {}) },
      });
      const pending = once(req, 'response');
      req.end();
      const [response] = await pending;
      return { status: response.statusCode, body: await text(response) };
    }

    try {
      const passwordHash = await bcrypt.hash(`Board-${randomUUID()}`, 4);
      const admin = await User.create({
        username: `board_admin_${suffix}`,
        role: 'admin',
        passwordHash,
      });
      userIds.push(admin.id);
      const member = await User.create({
        username: `board_user_${suffix}`,
        role: 'user',
        passwordHash,
      });
      userIds.push(member.id);
      adminCookie = await createSessionCookie(admin.id);
      const memberCookie = await createSessionCookie(member.id);
      await waitForJobReady(queue);

      await context.test(
        'all native entrypoints require a live administrator session',
        async () => {
          for (const path of [
            '',
            '/_status',
            '/static/js/main.js',
            '/api/queues',
            '/api/redis/stats',
          ]) {
            for (const [cookie, status] of [
              ['', 401],
              [memberCookie, 403],
            ]) {
              const response = await requestBoard(path, { cookie });
              assert.equal(response.status, status, path);
              assert.match(response.headers.get('cache-control'), /no-store/);
            }
          }
          for (const [cookie, status] of [
            ['', 401],
            [memberCookie, 403],
          ]) {
            const response = await requestBoard(`${QUEUE_PATH}/pause`, { method: 'PUT', cookie });
            assert.equal(response.status, status);
          }
          assert.equal(await queue.isPaused(), false);
          for (const [cookie, destination] of [
            ['', '/login'],
            [memberCookie, '/user/dashboard'],
          ]) {
            const response = await fetch(`${baseUrl}/admin/jobs`, {
              redirect: 'manual',
              headers: cookie ? { Cookie: cookie } : {},
            });
            assert.equal(response.status, 307);
            assert.equal(response.headers.get('location'), destination);
          }
        },
      );

      await context.test(
        'status issues a scoped CSRF token and preserves the project envelope',
        async () => {
          const response = await requestBoard('/_status');
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { status: true, data: {}, error: {} });
          const cookie = response.headers
            .getSetCookie()
            .find((value) => value.startsWith('XSRF-TOKEN='));
          assert.ok(cookie);
          assert.match(cookie, /Path=\/api\/admin\/bull-board(?:;|$)/);
          assert.match(cookie, /SameSite=(?:Strict|Lax)/i);
          assert.doesNotMatch(cookie, /HttpOnly/i);
          csrfCookie = cookie.split(';')[0];
          csrfToken = decodeURIComponent(csrfCookie.slice('XSRF-TOKEN='.length));
          adminCookie = `${adminCookie}; ${csrfCookie}`;
          assert.ok(csrfToken.length > 32);
        },
      );

      await context.test(
        'production serves native HTML, static assets and writable queue metadata',
        async () => {
          const response = await requestBoard('');
          assert.equal(response.status, 200);
          assert.match(response.headers.get('content-type'), /text\/html/);
          assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
          assert.match(response.headers.get('cache-control'), /no-store/);
          const html = await response.text();
          assert.ok(html.includes(`<base href="${BOARD_PATH}/"`));
          const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
          assert.ok(scripts.length > 0, 'Bull Board must reference bundled UI assets');
          const script = scripts.find((source) => source.includes('static/js/'));
          assert.ok(script);
          const scriptUrl = new URL(script, `${baseUrl}${BOARD_PATH}/`);
          assert.equal(scriptUrl.origin, baseUrl);
          const staticPath = scriptUrl.pathname.slice(BOARD_PATH.length);
          const asset = await requestBoard(staticPath);
          assert.equal(asset.status, 200);
          assert.match(asset.headers.get('content-type'), /javascript/);
          assert.ok((await asset.text()).length > 100);
          for (const [cookie, status] of [
            ['', 401],
            [memberCookie, 403],
          ]) {
            assert.equal((await requestBoard(staticPath, { cookie })).status, status);
          }
          for (const path of ['/admin/jobs', '/login']) {
            const page = await fetch(`${baseUrl}${path}`, {
              redirect: 'manual',
              headers: { Cookie: adminCookie },
            });
            assert.equal(page.headers.get('x-frame-options'), 'DENY');
            if (path === '/admin/jobs') assert.equal(page.status, 200);
          }
          const listed = await requestBoard('/api/queues?activeQueue=background&status=waiting');
          assert.equal(listed.status, 200);
          const payload = await listed.json();
          assert.equal(Object.hasOwn(payload, 'data'), false);
          assert.equal(payload.queues.length, 1);
          assert.equal(payload.queues[0].name, 'background');
          assert.equal(payload.queues[0].readOnlyMode, false);
          assert.equal(payload.queues[0].allowRetries, true);
          assert.equal(payload.queues[0].allowCompletedRetries, true);
          const stats = await requestBoard('/api/redis/stats');
          assert.equal(stats.status, 200);
          assert.equal(Object.hasOwn(await stats.json(), 'data'), false);
        },
      );

      await context.test(
        'conditional requests preserve authentication failures and current queue responses',
        async () => {
          for (const path of ['/_status', '/api/queues']) {
            for (const [cookie, status] of [
              ['', 401],
              [memberCookie, 403],
              [adminCookie, 200],
            ]) {
              const response = await requestConditional(path, cookie);
              assert.equal(response.status, status, path);
              const payload = JSON.parse(response.body);
              if (status !== 200) assert.ok(payload.error);
              else if (path === '/_status') {
                assert.deepEqual(payload, { status: true, data: {}, error: {} });
              } else {
                assert.equal(payload.queues[0].name, 'background');
              }
            }
          }
        },
      );

      await context.test(
        'writes reject missing, forged and cross-session CSRF tokens',
        async () => {
          const otherSession = await createSessionCookie(admin.id);
          for (const options of [
            { token: '' },
            { token: 'forged-token' },
            { cookie: adminCookie.split(';')[0], token: csrfToken },
            { cookie: `${otherSession}; ${csrfCookie}`, token: csrfToken },
            {
              cookie: `${adminCookie.split(';')[0]}; XSRF-TOKEN=forged-token`,
              token: 'forged-token',
            },
          ]) {
            const response = await requestBoard(`${QUEUE_PATH}/pause`, {
              method: 'PUT',
              ...options,
            });
            assert.equal(response.status, 403);
            assert.equal(await queue.isPaused(), false);
          }
          const preflight = await requestBoard(`${QUEUE_PATH}/pause`, {
            method: 'OPTIONS',
            cookie: '',
            token: '',
            headers: { Origin: 'https://other.example', 'Access-Control-Request-Method': 'PUT' },
          });
          assert.equal(preflight.headers.get('access-control-allow-origin'), null);
          assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
        },
      );

      await context.test(
        'native add, data editing, pause, resume and deletion change the real queue',
        async () => {
          const jobId = `board-manual-${suffix}`;
          const added = await writeBoard(`${QUEUE_PATH}/add`, {
            method: 'POST',
            body: { name: 'manual-fixture', data: { source: 'board' }, options: { jobId } },
          });
          assert.equal(added.job.id, jobId);
          assert.equal(added.status, 'waiting');
          assert.deepEqual((await queue.getJob(jobId)).data, { source: 'board' });
          await writeBoard(`${QUEUE_PATH}/${jobId}/update-data`, {
            method: 'PATCH',
            body: { jobData: { source: 'edited', count: 2 } },
          });
          assert.deepEqual((await queue.getJob(jobId)).data, { source: 'edited', count: 2 });
          await writeBoard(`${QUEUE_PATH}/pause`);
          assert.equal(await queue.isPaused(), true);
          await writeBoard(`${QUEUE_PATH}/resume`);
          assert.equal(await queue.isPaused(), false);
          await writeBoard(`${QUEUE_PATH}/${jobId}/clean`, { status: 204 });
          assert.equal(await queue.getJob(jobId), undefined);
        },
      );

      await context.test(
        'failed and completed retries keep native semantics and safe failure details',
        async () => {
          let shouldFail = true;
          const sensitive = `secret-sql-${randomUUID()}`;
          const worker = createJobWorker({
            'retry-fixture': {
              schema: z.object({}).strict(),
              run: async () => {
                if (shouldFail) throw new Error(`SELECT password FROM users ${sensitive}`);
                return { recovered: true };
              },
            },
          });
          workers.push(worker);
          const added = await writeBoard(`${QUEUE_PATH}/add`, {
            method: 'POST',
            body: { name: 'retry-fixture', data: {}, options: { attempts: 1 } },
          });
          const job = await queue.getJob(added.job.id);
          await waitForState(job, 'failed');
          const failed = await requestBoard(`${QUEUE_PATH}/${job.id}`);
          assert.equal(failed.status, 200);
          const failedText = await failed.text();
          assert.ok(!failedText.includes(sensitive));
          assert.equal(JSON.parse(failedText).job.failedReason, 'JOB_EXECUTION_FAILED');
          shouldFail = false;
          await writeBoard(`${QUEUE_PATH}/${job.id}/retry`, { status: 204 });
          await waitForState(job, 'completed');
          assert.equal((await queue.getJob(job.id)).attemptsMade, 2);
          await worker.pause();
          await writeBoard(`${QUEUE_PATH}/${job.id}/retry`, { status: 204 });
          assert.equal(await job.getState(), 'waiting');
          await worker.resume();
          await waitForState(job, 'completed');
          assert.equal((await queue.getJob(job.id)).attemptsMade, 3);
          assert.deepEqual((await queue.getJob(job.id)).returnvalue, { recovered: true });
          await worker.close();
          await writeBoard(`${QUEUE_PATH}/${job.id}/clean`, { status: 204 });
        },
      );

      await context.test(
        'scheduler editing, immediate execution and removal remain available',
        async () => {
          const schedulerId = `board-scheduler-${suffix}`;
          await queue.upsertJobScheduler(
            schedulerId,
            { every: 3600000 },
            {
              name: 'scheduler-fixture',
              data: { fixture: suffix },
            },
          );
          const listed = await requestBoard('/api/job-schedulers?queueName=background');
          assert.equal(listed.status, 200);
          assert.ok(
            (await listed.json()).schedulers.some((scheduler) => scheduler.id === schedulerId),
          );
          const schedulerPath = `${QUEUE_PATH}/job-schedulers/${schedulerId}`;
          await writeBoard(schedulerPath, {
            method: 'PATCH',
            body: { every: 7200000 },
            status: 204,
          });
          assert.equal(Number((await queue.getJobScheduler(schedulerId)).every), 7200000);
          const run = await writeBoard(`${schedulerPath}/run`);
          assert.equal(run.job.name, 'scheduler-fixture');
          assert.deepEqual((await queue.getJob(run.job.id)).data, { fixture: suffix });
          assert.ok(await queue.getJobScheduler(schedulerId));
          await writeBoard(`${schedulerPath}/remove`, { status: 204 });
          assert.equal(await queue.getJobScheduler(schedulerId), undefined);
          await writeBoard(`${QUEUE_PATH}/${run.job.id}/clean`, { status: 204 });
        },
      );

      await context.test(
        'invalid requests expose neither request bodies nor server internals',
        async () => {
          const marker = `private-payload-${randomUUID()}`;
          const malformed = await requestBoard(`${QUEUE_PATH}/add`, {
            method: 'POST',
            raw: `{"value":"${marker}",`,
          });
          assert.equal(malformed.status, 400);
          const text = await malformed.text();
          assert.ok(!text.includes(marker));
          assert.doesNotMatch(text, /node_modules|SyntaxError|\bat\s+.*\.js:/);
          const invalid = await requestBoard(`${QUEUE_PATH}/add`, {
            method: 'POST',
            body: { name: marker, data: { marker }, options: { sizeLimit: 1 } },
          });
          assert.equal(invalid.status, 503);
          const error = await invalid.text();
          assert.ok(!error.includes(marker));
          assert.doesNotMatch(error, /node_modules|\bat\s+.*\.js:/);
        },
      );

      await context.test(
        'revoked sessions immediately lose page, read and write access',
        async () => {
          await Session.destroy({ where: { userId: admin.id } });
          for (const path of ['', '/_status', '/api/queues']) {
            assert.equal((await requestBoard(path)).status, 401);
            const conditional = await requestConditional(path);
            assert.equal(conditional.status, 401);
            assert.ok(JSON.parse(conditional.body).error);
          }
          assert.equal((await requestBoard(`${QUEUE_PATH}/pause`, { method: 'PUT' })).status, 401);
          assert.equal(await queue.isPaused(), false);
          const page = await fetch(`${baseUrl}/admin/jobs`, {
            redirect: 'manual',
            headers: { Cookie: adminCookie },
          });
          assert.equal(page.status, 307);
          assert.equal(page.headers.get('location'), '/login');
        },
      );
    } finally {
      try {
        await Promise.all(workers.map((worker) => worker.close()));
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
        try {
          await Session.destroy({ where: { userId: userIds } });
          await User.destroy({ where: { id: userIds } });
        } finally {
          await database.close();
        }
      }
    }
  },
);
