import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getUserModel } from '../../src/modules/users/models.js';
import { authenticateUser } from '../../src/modules/users/server.js';
import { changeUserBalance, createUser } from '../../src/modules/users/admin/server.js';
import { listMyBalanceLogs } from '../../src/modules/users/user/server.js';
import { baseUrl, call } from '../helpers/api.js';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '集成测试必须使用名称以 _test 结尾的独立数据库');

test('real MySQL: separate workspaces enforce fixed roles and remove legacy entrypoints', async (context) => {
  const database = getDatabase();
  const User = getUserModel();
  const Session = getSessionModel();
  const createdIds = [];
  const suffix = randomUUID().slice(0, 8);
  const password = `Separation-${randomUUID()}`;

  // Disposable accounts and sealed fixtures never change the real administrator or login quota.
  async function createSession(userId) {
    const id = randomUUID();
    await Session.create({ id, userId, expiresAt: new Date(Date.now() + 3600000) });
    const sealed = await sealData(
      { sessionId: id },
      { password: process.env.SESSION_SECRET, ttl: 3600 },
    );
    return `starter_session=${sealed}`;
  }

  async function fetchPage(path, cookie) {
    return fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      headers: cookie ? { Cookie: cookie } : {},
    });
  }

  try {
    const admin = await User.create({
      username: `split_admin_${suffix}`,
      passwordHash: await bcrypt.hash(password, 4),
      role: 'admin',
    });
    createdIds.push(admin.id);
    const member = await createUser({ username: `split_member_${suffix}`, password });
    createdIds.push(member.id);
    const other = await createUser({ username: `split_other_${suffix}`, password });
    createdIds.push(other.id);
    const adminCookie = await createSession(admin.id);
    const memberCookie = await createSession(member.id);

    await context.test(
      'each workspace rejects the other role before executing business logic',
      async () => {
        const adminRoutes = [
          ['/api/admin/me', 'GET'],
          ['/api/admin/password', 'POST'],
          ['/api/admin/users', 'GET'],
          ['/api/admin/users', 'POST'],
          [`/api/admin/users/${member.id}`, 'GET'],
          [`/api/admin/users/${member.id}`, 'PUT'],
          [`/api/admin/users/${member.id}`, 'DELETE'],
          [`/api/admin/users/${member.id}/balance`, 'POST'],
          [`/api/admin/users/${member.id}/status`, 'PUT'],
          [`/api/admin/users/${member.id}/password`, 'POST'],
          ['/api/admin/balance-logs', 'GET'],
          ['/api/admin/categories', 'GET'],
          ['/api/admin/categories', 'POST'],
          ['/api/admin/categories/1', 'GET'],
          ['/api/admin/categories/1', 'PUT'],
          ['/api/admin/categories/1', 'DELETE'],
          ['/api/admin/settings/registration', 'GET'],
          ['/api/admin/settings/registration', 'PUT'],
        ];
        const userRoutes = [
          ['/api/user/me', 'GET'],
          ['/api/user/password', 'POST'],
          ['/api/user/balance-logs', 'GET'],
        ];
        for (const [routes, wrongCookie] of [
          [adminRoutes, memberCookie],
          [userRoutes, adminCookie],
        ]) {
          for (const [path, method] of routes) {
            assert.equal((await call(path, { method })).response.status, 401, path);
            const rejected = await call(path, { method, cookie: wrongCookie });
            assert.equal(rejected.response.status, 403, `${method} ${path}`);
            assert.equal(rejected.payload.error.code, 'FORBIDDEN');
          }
        }
        const profile = await call(`/api/user/me?userId=${other.id}&role=admin`, {
          cookie: memberCookie,
        });
        assert.equal(profile.response.status, 200);
        assert.equal(profile.data.user.id, member.id);
        assert.equal(profile.data.user.role, 'user');
      },
    );

    await context.test(
      'page guards apply to both workspaces and send each role to its own home',
      async () => {
        const groups = [
          {
            pages: [
              '/admin/users',
              '/admin/balance-logs',
              '/admin/categories',
              '/admin/settings',
              '/admin/profile',
            ],
            ownCookie: adminCookie,
            wrongCookie: memberCookie,
            wrongHome: '/user/dashboard',
          },
          {
            pages: ['/user/dashboard', '/user/balance-logs', '/user/profile'],
            ownCookie: memberCookie,
            wrongCookie: adminCookie,
            wrongHome: '/admin/users',
          },
        ];
        for (const { pages, ownCookie, wrongCookie, wrongHome } of groups) {
          for (const path of pages) {
            const guest = await fetchPage(path);
            assert.equal(guest.status, 307, path);
            assert.equal(guest.headers.get('location'), '/login');
            const wrongRole = await fetchPage(path, wrongCookie);
            assert.equal(wrongRole.status, 307, path);
            assert.equal(wrongRole.headers.get('location'), wrongHome);
            assert.equal((await fetchPage(path, ownCookie)).status, 200, path);
          }
        }
        for (const [cookie, home] of [
          [adminCookie, '/admin/users'],
          [memberCookie, '/user/dashboard'],
        ]) {
          for (const path of ['/', '/login', '/register']) {
            const response = await fetchPage(path, cookie);
            assert.equal(response.status, 307);
            assert.equal(response.headers.get('location'), home);
          }
        }
      },
    );

    await context.test(
      'old pages and old business APIs return 404 without redirects or aliases',
      async () => {
        for (const path of [
          '/users',
          '/dashboard',
          '/balance-logs',
          '/profile',
          '/categories',
          '/settings',
        ]) {
          assert.equal((await fetchPage(path, adminCookie)).status, 404, path);
        }
        for (const [path, method] of [
          ['/api/users', 'GET'],
          ['/api/users', 'POST'],
          [`/api/users/${member.id}`, 'GET'],
          [`/api/users/${member.id}`, 'DELETE'],
          [`/api/users/${member.id}/balance`, 'POST'],
          [`/api/users/${member.id}/status`, 'PUT'],
          [`/api/users/${member.id}/password`, 'POST'],
          ['/api/categories', 'GET'],
          ['/api/categories/1', 'GET'],
          ['/api/settings/registration', 'PUT'],
          ['/api/balance-logs', 'GET'],
          ['/api/auth/me', 'GET'],
          ['/api/auth/password', 'POST'],
        ]) {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            redirect: 'manual',
            headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
            ...(method === 'GET' ? {} : { body: '{}' }),
          });
          assert.equal(response.status, 404, `${method} ${path}`);
        }
      },
    );

    await context.test(
      'user log services require identity and never fall back to all accounts',
      async () => {
        for (const account of [member, other]) {
          await changeUserBalance(
            account.id,
            {
              direction: 'increase',
              amount: '0.0001',
              reason: `路由隔离 ${account.username}`,
              operationId: randomUUID(),
            },
            admin.id,
          );
        }
        for (const missingId of [undefined, null, 0]) {
          await assert.rejects(async () => listMyBalanceLogs(missingId, {}));
        }
        const logs = await listMyBalanceLogs(member.id, {});
        assert.equal(logs.pagination.total, 1);
        assert.deepEqual(
          logs.items.map((item) => item.userId),
          [member.id],
        );
        await assert.rejects(async () => listMyBalanceLogs(member.id, { userId: other.id }));
        const adminLogs = await call(`/api/admin/balance-logs?userId=${other.id}`, {
          cookie: adminCookie,
        });
        assert.equal(adminLogs.response.status, 200);
        assert.equal(adminLogs.data.pagination.total, 1);
        assert.equal(adminLogs.data.items[0].userId, other.id);
      },
    );

    await context.test(
      'both password endpoints change only the session owner and revoke all its sessions',
      async () => {
        for (const [account, cookie, prefix] of [
          [admin, adminCookie, '/api/admin'],
          [member, memberCookie, '/api/user'],
        ]) {
          const otherDevice = await createSession(account.id);
          const newPassword = `Changed-${randomUUID()}`;
          const changed = await call(`${prefix}/password`, {
            method: 'POST',
            cookie,
            body: { currentPassword: password, newPassword },
          });
          assert.equal(changed.response.status, 200);
          assert.match(changed.response.headers.get('set-cookie'), /Max-Age=0/);
          for (const oldCookie of [cookie, otherDevice]) {
            assert.equal((await call(`${prefix}/me`, { cookie: oldCookie })).response.status, 401);
          }
          assert.equal(await Session.count({ where: { userId: account.id } }), 0);
          await assert.rejects(authenticateUser({ username: account.username, password }), {
            code: 'INVALID_CREDENTIALS',
          });
          assert.equal(
            (await authenticateUser({ username: account.username, password: newPassword })).id,
            account.id,
          );
          assert.equal(
            (await authenticateUser({ username: other.username, password })).id,
            other.id,
          );
        }
      },
    );
  } finally {
    try {
      for (const id of createdIds.reverse()) await User.destroy({ where: { id } });
    } finally {
      await database.close();
    }
  }
});
