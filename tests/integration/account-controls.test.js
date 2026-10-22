import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { login } from '../../src/modules/auth/server.js';
import { getBalanceLogModel, getUserModel } from '../../src/modules/users/models.js';
import {
  changeUserBalance,
  createUser,
  resetAdminPassword,
  resetUserPassword,
  updateUserStatus,
} from '../../src/modules/users/admin/server.js';
import { authenticateUser, getUserById } from '../../src/modules/users/server.js';
import { call } from '../helpers/api.js';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '集成测试必须使用名称以 _test 结尾的独立数据库');

test('real MySQL: account status, password resets and atomic session revocation', async (context) => {
  const database = getDatabase();
  const User = getUserModel();
  const Session = getSessionModel();
  const createdIds = new Set();
  const suffix = randomUUID().slice(0, 8);
  const password = `Controls-${randomUUID()}`;
  let admin;
  let currentPassword = password;

  async function createMember(label) {
    const user = await createUser({ username: `controls_${label}_${suffix}`, password }, admin.id);
    createdIds.add(user.id);
    return user;
  }

  // Fixture cookies exercise the HTTP authorization path without consuming shared login quotas.
  async function createSession(userId) {
    const id = randomUUID();
    await Session.create({ id, userId, expiresAt: new Date(Date.now() + 3600000) });
    const sealed = await sealData(
      { sessionId: id },
      { password: process.env.SESSION_SECRET, ttl: 3600 },
    );
    return `starter_session=${sealed}`;
  }

  try {
    // This disposable four-character administrator verifies recovery of legacy short usernames.
    admin = await User.create({
      username: `a${suffix.slice(0, 3)}`,
      displayName: '账号维护测试管理员',
      passwordHash: await bcrypt.hash(password, 4),
      role: 'admin',
    });
    const adminCookie = await createSession(admin.id);
    const member = await createMember('member');
    const other = await createMember('other');
    let memberCookies = [await createSession(member.id), await createSession(member.id)];
    const otherCookie = await createSession(other.id);
    await changeUserBalance(
      member.id,
      {
        direction: 'increase',
        amount: '1.2345',
        reason: '启停及重置后保留余额',
        operationId: randomUUID(),
      },
      admin.id,
    );

    await context.test(
      'account controls require an administrator and reject administrator targets',
      async () => {
        for (const [action, method, body] of [
          ['status', 'PUT', { isEnabled: false }],
          ['password', 'POST', { newPassword: `Reset-${randomUUID()}` }],
        ]) {
          const path = `/api/admin/users/${member.id}/${action}`;
          assert.equal((await call(path, { method, body })).response.status, 401);
          assert.equal(
            (await call(path, { method, body, cookie: memberCookies[0] })).response.status,
            403,
          );
          assert.equal(
            (
              await call(`/api/admin/users/${admin.id}/${action}`, {
                method,
                body,
                cookie: adminCookie,
              })
            ).response.status,
            404,
          );
        }
        assert.equal((await getUserById(member.id)).isEnabled, true);
        assert.equal((await authenticateUser({ username: admin.username, password })).id, admin.id);
      },
    );

    await context.test(
      'status and reset inputs reject coercion, extra fields and invalid passwords',
      async () => {
        for (const body of [{}, { isEnabled: 'false' }, { isEnabled: false, role: 'admin' }]) {
          assert.equal(
            (
              await call(`/api/admin/users/${member.id}/status`, {
                method: 'PUT',
                cookie: adminCookie,
                body,
              })
            ).response.status,
            400,
          );
        }
        for (const body of [
          { newPassword: 'short' },
          { newPassword: '密'.repeat(25) },
          { newPassword: password, role: 'admin' },
        ]) {
          assert.equal(
            (
              await call(`/api/admin/users/${member.id}/password`, {
                method: 'POST',
                cookie: adminCookie,
                body,
              })
            ).response.status,
            400,
          );
        }
        assert.equal((await getUserById(member.id)).isEnabled, true);
        assert.equal(await Session.count({ where: { userId: member.id } }), 2);
      },
    );

    await context.test(
      'disabling revokes all sessions and preserves balances and logs',
      async () => {
        const result = await call(`/api/admin/users/${member.id}/status`, {
          method: 'PUT',
          cookie: adminCookie,
          body: { isEnabled: false },
        });
        assert.equal(result.response.status, 200);
        assert.equal(result.data.isEnabled, false);
        assert.equal(result.data.balance, '1.2345');
        assert.equal(await getBalanceLogModel().count({ where: { userId: member.id } }), 1);
        assert.equal(await Session.count({ where: { userId: member.id } }), 0);
        for (const cookie of memberCookies) {
          assert.equal((await call('/api/user/me', { cookie })).response.status, 401);
        }
        await assert.rejects(authenticateUser({ username: member.username, password }), {
          status: 403,
          code: 'ACCOUNT_DISABLED',
        });
        assert.equal((await call('/api/user/me', { cookie: otherCookie })).response.status, 200);
      },
    );

    await context.test(
      'enabling permits authentication without restoring revoked sessions',
      async () => {
        const result = await call(`/api/admin/users/${member.id}/status`, {
          method: 'PUT',
          cookie: adminCookie,
          body: { isEnabled: true },
        });
        assert.equal(result.response.status, 200);
        assert.equal(result.data.isEnabled, true);
        assert.equal(
          (await authenticateUser({ username: member.username, password })).id,
          member.id,
        );
        for (const cookie of memberCookies) {
          assert.equal((await call('/api/user/me', { cookie })).response.status, 401);
        }
        assert.equal(await Session.count({ where: { userId: member.id } }), 0);
        memberCookies = [await createSession(member.id), await createSession(member.id)];
      },
    );

    await context.test(
      'resetting changes only the target password and revokes all of its sessions',
      async () => {
        const newPassword = '123456';
        const result = await call(`/api/admin/users/${member.id}/password`, {
          method: 'POST',
          cookie: adminCookie,
          body: { newPassword },
        });
        assert.equal(result.response.status, 200);
        assert.deepEqual(result.data, {});
        await assert.rejects(authenticateUser({ username: member.username, password }), {
          code: 'INVALID_CREDENTIALS',
        });
        assert.equal(
          (await authenticateUser({ username: member.username, password: newPassword })).id,
          member.id,
        );
        for (const cookie of memberCookies) {
          assert.equal((await call('/api/user/me', { cookie })).response.status, 401);
        }
        assert.equal(await Session.count({ where: { userId: member.id } }), 0);
        assert.equal((await getUserById(member.id)).balance, '1.2345');
        assert.equal(await getBalanceLogModel().count({ where: { userId: member.id } }), 1);
        assert.equal((await authenticateUser({ username: other.username, password })).id, other.id);
        assert.equal((await call('/api/user/me', { cookie: otherCookie })).response.status, 200);
        currentPassword = newPassword;
      },
    );

    await context.test('resetting a disabled account does not enable it', async () => {
      await updateUserStatus(member.id, { isEnabled: false }, admin.id);
      const newPassword = `Disabled-${randomUUID()}`;
      await resetUserPassword(member.id, { newPassword }, admin.id);
      assert.equal((await getUserById(member.id)).isEnabled, false);
      await assert.rejects(
        authenticateUser({ username: member.username, password: currentPassword }),
        {
          code: 'INVALID_CREDENTIALS',
        },
      );
      await assert.rejects(authenticateUser({ username: member.username, password: newPassword }), {
        code: 'ACCOUNT_DISABLED',
      });
      await updateUserStatus(member.id, { isEnabled: true }, admin.id);
      currentPassword = newPassword;
    });

    await context.test(
      'session revocation failures roll back status and password changes',
      async (subtest) => {
        const cookie = await createSession(member.id);
        const before = await User.findByPk(member.id, {
          attributes: ['passwordHash', 'isEnabled', 'balance'],
          raw: true,
        });
        const fault = subtest.mock.method(Session, 'destroy', async () => {
          throw new Error('Injected session revocation failure');
        });
        try {
          await assert.rejects(
            updateUserStatus(member.id, { isEnabled: false }, admin.id),
            /Injected session/,
          );
          await assert.rejects(
            resetUserPassword(member.id, { newPassword: `Rollback-${randomUUID()}` }, admin.id),
            /Injected session/,
          );
        } finally {
          fault.mock.restore();
        }
        assert.deepEqual(
          await User.findByPk(member.id, {
            attributes: ['passwordHash', 'isEnabled', 'balance'],
            raw: true,
          }),
          before,
        );
        assert.equal(await Session.count({ where: { userId: member.id } }), 1);
        assert.equal((await call('/api/user/me', { cookie })).response.status, 200);
      },
    );

    await context.test('concurrent login and disable cannot leave a usable session', async () => {
      const racing = await createMember('race');
      const headers = new Map();
      const response = {
        getHeader: (name) => headers.get(name.toLowerCase()),
        setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      };
      const results = await Promise.allSettled([
        login({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, response, {
          username: racing.username,
          password,
        }),
        updateUserStatus(racing.id, { isEnabled: false }, admin.id),
      ]);
      assert.equal(results[1].status, 'fulfilled');
      if (results[0].status === 'rejected') {
        assert.equal(results[0].reason.code, 'ACCOUNT_DISABLED');
      } else {
        const [setCookie] = headers.get('set-cookie');
        assert.equal(
          (await call('/api/user/me', { cookie: setCookie.split(';')[0] })).response.status,
          401,
        );
      }
      assert.equal((await getUserById(racing.id)).isEnabled, false);
      assert.equal(await Session.count({ where: { userId: racing.id } }), 0);
    });

    await context.test(
      'administrator recovery targets existing administrators without elevating users',
      async () => {
        const newPassword = '654321';
        await assert.rejects(resetAdminPassword(member.username, { newPassword }), {
          code: 'USER_NOT_FOUND',
        });
        assert.equal((await getUserById(member.id)).role, 'user');
        assert.equal(
          (await authenticateUser({ username: member.username, password: currentPassword })).id,
          member.id,
        );
        await resetAdminPassword(admin.username, { newPassword });
        await assert.rejects(authenticateUser({ username: admin.username, password }), {
          code: 'INVALID_CREDENTIALS',
        });
        const recovered = await authenticateUser({
          username: admin.username,
          password: newPassword,
        });
        assert.equal(recovered.role, 'admin');
        assert.equal(recovered.isEnabled, true);
        assert.equal((await call('/api/admin/me', { cookie: adminCookie })).response.status, 401);
        assert.equal(await Session.count({ where: { userId: admin.id } }), 0);
      },
    );
  } finally {
    try {
      for (const id of createdIds) await User.destroy({ where: { id, role: 'user' } });
      if (admin) await User.destroy({ where: { id: admin.id, role: 'admin' } });
    } finally {
      await database.close();
    }
  }
});
