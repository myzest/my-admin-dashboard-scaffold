import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getBalanceLogModel } from '../../src/modules/users/models.js';
import { changeUserBalance } from '../../src/modules/users/admin/server.js';
import { MAX_BALANCE } from '../../src/modules/users/money.js';
import { baseUrl, call } from '../helpers/api.js';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '集成测试必须使用名称以 _test 结尾的独立数据库');

test('real MySQL: users, registration, exact balances, isolation and hard deletion', async (context) => {
  const database = getDatabase();
  const createdIds = new Set();
  const cookies = new Set();
  const suffix = randomUUID().slice(0, 8);
  const password = `Initial-${randomUUID()}`;
  let adminCookie;
  let previousRegistration;

  async function login(username, loginPassword, previousCookie) {
    const result = await call('/api/auth/login', {
      method: 'POST',
      cookie: previousCookie,
      body: { username, password: loginPassword },
    });
    assert.equal(result.response.status, 200);
    const cookie = result.response.headers.get('set-cookie').split(';')[0];
    cookies.add(cookie);
    return { cookie, user: result.data.user };
  }

  async function createUser(username) {
    const result = await call('/api/admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username, displayName: `测试 ${suffix}`, password },
    });
    assert.equal(result.response.status, 201);
    createdIds.add(result.data.id);
    return result.data;
  }

  function setRegistration(allowRegistration) {
    return call('/api/admin/settings/registration', {
      method: 'PUT',
      cookie: adminCookie,
      body: { allowRegistration },
    });
  }

  function adjustBalance(userId, values = {}) {
    return call(`/api/admin/users/${userId}/balance`, {
      method: 'POST',
      cookie: adminCookie,
      body: {
        direction: 'increase',
        amount: '1.0000',
        reason: '集成测试调账',
        operationId: randomUUID(),
        ...values,
      },
    });
  }

  async function getStoredState(userId) {
    const [users] = await database.query('SELECT balance FROM users WHERE id = :userId', {
      replacements: { userId },
    });
    const [[logs]] = await database.query(
      'SELECT COUNT(*) AS total FROM balance_logs WHERE user_id = :userId',
      { replacements: { userId } },
    );
    const [[sessions]] = await database.query(
      'SELECT COUNT(*) AS total FROM sessions WHERE user_id = :userId',
      { replacements: { userId } },
    );
    return {
      balance: users[0]?.balance ?? null,
      logs: Number(logs.total),
      sessions: Number(sessions.total),
    };
  }

  try {
    const adminLogin = await login(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
    adminCookie = adminLogin.cookie;
    const admin = adminLogin.user;
    const setting = await call('/api/admin/settings/registration', { cookie: adminCookie });
    assert.equal(setting.response.status, 200);
    previousRegistration = setting.data.allowRegistration;
    assert.equal(typeof previousRegistration, 'boolean');
    assert.equal((await setRegistration(false)).response.status, 200);

    await context.test('closed registration is enforced by the API', async () => {
      assert.deepEqual((await call('/api/auth/registration')).data, { allowRegistration: false });
      const result = await call('/api/auth/register', {
        method: 'POST',
        body: { username: `closed_${suffix}`, password },
      });
      assert.equal(result.response.status, 403);
      assert.equal(result.payload.error.code, 'REGISTRATION_CLOSED');
    });

    const user = await createUser(`member_${suffix}`);
    const other = await createUser(`other_${suffix}`);

    await context.test(
      'admin creates, searches and edits ordinary users while registration is closed',
      async () => {
        assert.equal(user.role, 'user');
        assert.equal(user.balance, '0.0000');
        assert.equal(Object.hasOwn(user, 'passwordHash'), false);
        const listed = await call(
          `/api/admin/users?search=${user.username}&page=1&pageSize=1&_t=1`,
          {
            cookie: adminCookie,
          },
        );
        assert.deepEqual(listed.data.pagination, { page: 1, pageSize: 1, total: 1 });
        assert.equal(listed.data.items[0].id, user.id);
        const updated = await call(`/api/admin/users/${user.id}`, {
          method: 'PUT',
          cookie: adminCookie,
          body: { username: user.username, displayName: '已编辑的普通用户' },
        });
        assert.equal(updated.data.displayName, '已编辑的普通用户');
        assert.equal(updated.data.balance, '0.0000');
        const duplicate = await call('/api/admin/users', {
          method: 'POST',
          cookie: adminCookie,
          body: { username: user.username, displayName: '重复', password },
        });
        assert.equal(duplicate.response.status, 409);
        assert.equal(duplicate.payload.error.code, 'USERNAME_EXISTS');
        const users = await call('/api/admin/users', { cookie: adminCookie });
        assert.ok(users.data.items.every((item) => item.role === 'user'));
      },
    );

    await context.test('user endpoints reject role and balance mass assignment', async () => {
      for (const extra of [{ role: 'admin' }, { balance: '999.0000' }, { id: admin.id }]) {
        const created = await call('/api/admin/users', {
          method: 'POST',
          cookie: adminCookie,
          body: { username: user.username, displayName: '测试', password, ...extra },
        });
        assert.equal(created.response.status, 400);
        const updated = await call(`/api/admin/users/${user.id}`, {
          method: 'PUT',
          cookie: adminCookie,
          body: { username: user.username, displayName: '测试', ...extra },
        });
        assert.equal(updated.response.status, 400);
      }
      for (const method of ['PUT', 'DELETE']) {
        const result = await call(`/api/admin/users/${admin.id}`, {
          method,
          cookie: adminCookie,
          body: { username: `protected_${suffix}`, displayName: '不可修改' },
        });
        assert.ok([403, 404].includes(result.response.status));
      }
      assert.deepEqual((await call('/api/admin/me', { cookie: adminCookie })).data.user, admin);
    });

    await context.test(
      'enabled registration creates an ordinary account without logging it in',
      async () => {
        assert.equal((await setRegistration(true)).response.status, 200);
        assert.deepEqual((await call('/api/auth/registration')).data, { allowRegistration: true });
        for (const extra of [{ role: 'admin' }, { balance: '1.0000' }]) {
          const rejected = await call('/api/auth/register', {
            method: 'POST',
            body: { username: user.username, password, ...extra },
          });
          assert.equal(rejected.response.status, 400);
        }
        const registered = await call('/api/auth/register', {
          method: 'POST',
          body: { username: `registered_${suffix}`, password },
        });
        assert.equal(registered.response.status, 201);
        createdIds.add(registered.data.user.id);
        assert.equal(registered.data.user.role, 'user');
        assert.equal(registered.data.user.balance, '0.0000');
        assert.equal(Object.hasOwn(registered.data.user, 'passwordHash'), false);
        assert.equal(registered.response.headers.get('set-cookie'), null);
        assert.equal((await setRegistration(false)).response.status, 200);
      },
    );

    const firstSession = await login(user.username, password);
    const secondSession = await login(user.username, password);
    let userCookie = firstSession.cookie;

    await context.test(
      'ordinary users enter their dashboard but cannot use admin APIs',
      async () => {
        const me = await call('/api/user/me', { cookie: userCookie });
        assert.equal(me.data.user.id, user.id);
        assert.equal(me.data.user.role, 'user');
        assert.equal(Object.hasOwn(me.data.user, 'passwordHash'), false);
        const dashboard = await fetch(`${baseUrl}/user/dashboard`, {
          headers: { Cookie: userCookie },
        });
        assert.equal(dashboard.status, 200);
        for (const path of [
          '/api/admin/users',
          '/api/admin/categories',
          '/api/admin/settings/registration',
        ]) {
          const result = await call(path, { cookie: userCookie });
          assert.equal(result.response.status, 403);
          assert.equal(result.payload.error.code, 'FORBIDDEN');
        }
        for (const [path, method, body] of [
          ['/api/admin/users', 'POST', { username: `blocked_${suffix}`, password }],
          [`/api/admin/users/${user.id}`, 'DELETE', {}],
          [`/api/admin/users/${user.id}/balance`, 'POST', { amount: '1.0000' }],
          ['/api/admin/settings/registration', 'PUT', { allowRegistration: true }],
        ]) {
          assert.equal(
            (await call(path, { method, body, cookie: userCookie })).response.status,
            403,
          );
        }
      },
    );

    await context.test(
      'balance inputs reject lossy numbers, invalid precision and non-positive adjustments',
      async () => {
        for (const amount of [
          0.1,
          '1e2',
          '1.00001',
          '-0.0001',
          '0',
          '0.0000',
          '10000000000000000',
        ]) {
          const result = await adjustBalance(user.id, { amount });
          assert.equal(result.response.status, 400, `amount ${JSON.stringify(amount)}`);
        }
        assert.equal((await adjustBalance(user.id, { direction: 'replace' })).response.status, 400);
        assert.equal((await adjustBalance(user.id, { reason: '   ' })).response.status, 400);
        assert.equal((await getStoredState(user.id)).balance, '0.0000');
        assert.equal((await getStoredState(user.id)).logs, 0);
      },
    );

    await context.test('twenty concurrent debits spend a single balance exactly once', async () => {
      const credited = await adjustBalance(user.id);
      assert.equal(credited.response.status, 200);
      assert.equal(credited.data.balanceBefore, '0.0000');
      assert.equal(credited.data.balanceAfter, '1.0000');
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          adjustBalance(user.id, { direction: 'decrease', amount: '0.1000' }),
        ),
      );
      assert.equal(results.filter(({ response }) => response.status === 200).length, 10);
      const rejected = results.filter(({ response }) => !response.ok);
      assert.equal(rejected.length, 10);
      assert.ok(rejected.every(({ payload }) => payload.error.code === 'INSUFFICIENT_BALANCE'));
      const state = await getStoredState(user.id);
      assert.equal(state.balance, '0.0000');
      assert.equal(state.logs, 11);
      const logs = await call(`/api/admin/balance-logs?userId=${user.id}&pageSize=100`, {
        cookie: adminCookie,
      });
      assert.equal(logs.data.pagination.total, 11);
      assert.equal(logs.data.items.filter((item) => item.changeAmount === '-0.1000').length, 10);
      assert.ok(logs.data.items.every((item) => item.operatorId === admin.id));
    });

    await context.test(
      'concurrent retries with the same operation ID produce one entry',
      async () => {
        const operationId = randomUUID();
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            adjustBalance(user.id, { operationId, amount: '0.2500' }),
          ),
        );
        assert.ok(results.every(({ response }) => response.status === 200));
        assert.equal(new Set(results.map(({ data }) => data.id)).size, 1);
        assert.equal((await getStoredState(user.id)).balance, '0.2500');
        assert.equal((await getStoredState(user.id)).logs, 12);
        const conflict = await adjustBalance(user.id, { operationId, amount: '0.5000' });
        assert.equal(conflict.response.status, 409);
        assert.equal(conflict.payload.error.code, 'OPERATION_CONFLICT');
      },
    );

    await context.test(
      'different users can receive their first balance entries concurrently',
      async () => {
        const recipients = await Promise.all(
          Array.from({ length: 8 }, (_, index) => createUser(`parallel_${suffix}_${index}`)),
        );
        const results = await Promise.all(
          recipients.map((recipient) => adjustBalance(recipient.id, { amount: '0.0001' })),
        );
        assert.ok(results.every(({ response }) => response.status === 200));
        for (const recipient of recipients) {
          assert.deepEqual(await getStoredState(recipient.id), {
            balance: '0.0001',
            logs: 1,
            sessions: 0,
          });
        }
        const sessions = await Promise.all(
          recipients.slice(0, 2).map(async (recipient) => {
            const staleSession = await sealData(
              { sessionId: randomUUID() },
              { password: process.env.SESSION_SECRET, ttl: 3600 },
            );
            return login(recipient.username, password, `starter_session=${staleSession}`);
          }),
        );
        for (const session of sessions) {
          const current = await call('/api/user/me', { cookie: session.cookie });
          assert.equal(current.response.status, 200);
          assert.equal(current.data.user.id, session.user.id);
        }
      },
    );

    await context.test(
      'large balances remain exact and cannot overflow DECIMAL(20,4)',
      async () => {
        const credited = await adjustBalance(other.id, { amount: MAX_BALANCE });
        assert.equal(credited.response.status, 200);
        assert.equal(credited.data.balanceAfter, MAX_BALANCE);
        const overflow = await adjustBalance(other.id, { amount: '0.0001' });
        assert.equal(overflow.response.status, 409);
        assert.equal(overflow.payload.error.code, 'BALANCE_LIMIT_EXCEEDED');
        assert.equal((await getStoredState(other.id)).balance, MAX_BALANCE);
        assert.equal((await getStoredState(other.id)).logs, 1);
      },
    );

    await context.test('ordinary users can only read their own balance logs', async () => {
      const logs = await call('/api/user/balance-logs', { cookie: userCookie });
      assert.equal(logs.response.status, 200);
      assert.equal(logs.data.pagination.total, 12);
      assert.ok(logs.data.items.every((item) => item.userId === user.id));
      for (const item of logs.data.items) {
        assert.match(item.changeAmount, /^-?\d+\.\d{4}$/);
        assert.match(item.balanceBefore, /^\d+\.\d{4}$/);
        assert.match(item.balanceAfter, /^\d+\.\d{4}$/);
      }
      for (const userId of [user.id, other.id, '', 'invalid']) {
        const rejected = await call(`/api/user/balance-logs?userId=${userId}`, {
          cookie: userCookie,
        });
        assert.equal(rejected.response.status, 400);
        assert.equal(rejected.payload.error.code, 'VALIDATION_ERROR');
      }
    });

    await context.test('a failed log write rolls back the balance change', async (subtest) => {
      const before = await getStoredState(user.id);
      const fault = subtest.mock.method(getBalanceLogModel(), 'create', async () => {
        throw new Error('Injected balance-log failure');
      });
      try {
        await assert.rejects(
          changeUserBalance(
            user.id,
            {
              direction: 'increase',
              amount: '0.0001',
              reason: '回滚验证',
              operationId: randomUUID(),
            },
            admin.id,
          ),
          /Injected balance-log failure/,
        );
      } finally {
        fault.mock.restore();
      }
      assert.deepEqual(await getStoredState(user.id), before);
    });

    await context.test('changing a password revokes every existing user session', async () => {
      const nextPassword = `Changed-${randomUUID()}`;
      const rejected = await call('/api/user/password', {
        method: 'POST',
        cookie: userCookie,
        body: { currentPassword: 'incorrect-password', newPassword: nextPassword },
      });
      assert.equal(rejected.response.status, 400);
      assert.equal(rejected.payload.error.code, 'INVALID_CURRENT_PASSWORD');
      assert.equal((await call('/api/user/me', { cookie: userCookie })).response.status, 200);
      const changed = await call('/api/user/password', {
        method: 'POST',
        cookie: userCookie,
        body: { currentPassword: password, newPassword: nextPassword },
      });
      assert.equal(changed.response.status, 200);
      assert.match(changed.response.headers.get('set-cookie'), /Max-Age=0/);
      for (const cookie of [userCookie, secondSession.cookie]) {
        assert.equal((await call('/api/user/me', { cookie })).response.status, 401);
      }
      assert.equal((await getStoredState(user.id)).sessions, 0);
      userCookie = (await login(user.username, nextPassword)).cookie;
      const oldPassword = await call('/api/auth/login', {
        method: 'POST',
        body: { username: user.username, password },
      });
      assert.equal(oldPassword.response.status, 401);
    });

    await context.test(
      'a nonzero-balance user can be hard deleted with logs and sessions',
      async () => {
        const otherSession = await login(other.username, password);
        const deleted = await call(`/api/admin/users/${other.id}`, {
          method: 'DELETE',
          cookie: adminCookie,
        });
        assert.equal(deleted.response.status, 200);
        assert.deepEqual(await getStoredState(other.id), { balance: null, logs: 0, sessions: 0 });
        assert.equal(
          (await call('/api/user/me', { cookie: otherSession.cookie })).response.status,
          401,
        );
        createdIds.delete(other.id);
      },
    );

    await context.test(
      'concurrent deletion and adjustment leave no orphaned user data',
      async () => {
        const [deleted, ...adjustments] = await Promise.all([
          call(`/api/admin/users/${user.id}`, { method: 'DELETE', cookie: adminCookie }),
          ...Array.from({ length: 4 }, () => adjustBalance(user.id, { amount: '0.0001' })),
        ]);
        assert.equal(deleted.response.status, 200);
        assert.ok(adjustments.every(({ response }) => [200, 404].includes(response.status)));
        assert.deepEqual(await getStoredState(user.id), { balance: null, logs: 0, sessions: 0 });
        assert.equal((await call('/api/user/me', { cookie: userCookie })).response.status, 401);
        createdIds.delete(user.id);
      },
    );
  } finally {
    try {
      if (typeof previousRegistration === 'boolean') {
        const restored = await setRegistration(previousRegistration);
        assert.equal(restored.response.status, 200);
      }
    } finally {
      for (const id of createdIds) {
        await database.query("DELETE FROM users WHERE id = :id AND role = 'user'", {
          replacements: { id },
        });
      }
      for (const cookie of cookies) await call('/api/auth/logout', { method: 'POST', cookie });
      await database.close();
    }
  }
});
