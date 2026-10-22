import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getBalanceLogModel, getUserModel } from '../../src/modules/users/models.js';
import {
  changeUserBalance,
  createUser,
  deleteUser,
  resetUserPassword,
  updateUser,
  updateUserStatus,
} from '../../src/modules/users/admin/server.js';
import { getCategoryModel } from '../../src/modules/categories/model.js';
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from '../../src/modules/categories/server.js';
import { getOperationLogModel } from '../../src/modules/operation-logs/model.js';
import { call } from '../helpers/api.js';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '操作日志测试必须使用独立测试库');

test('real MySQL: operation logs record session actors and roll back with business writes', async (context) => {
  const database = getDatabase();
  const User = getUserModel();
  const Session = getSessionModel();
  const Log = getOperationLogModel();
  const Category = getCategoryModel();
  const suffix = randomUUID().slice(0, 8);
  const password = `Audit-${randomUUID()}`;
  const userIds = [];
  const categoryIds = [];

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
    const admin = await User.create({
      username: `audit_admin_${suffix}`,
      passwordHash: await bcrypt.hash(password, 4),
      role: 'admin',
    });
    userIds.push(admin.id);
    const cookie = await createSession(admin.id);
    const created = await call('/api/admin/users?operatorId=1', {
      method: 'POST',
      cookie,
      body: { username: `audit_member_${suffix}`, displayName: '初始名字', password },
    });
    assert.equal(created.response.status, 201);
    const member = created.data;
    userIds.push(member.id);

    await context.test(
      'user changes keep only allowed fields and the authenticated actor',
      async () => {
        const rejected = await call('/api/admin/users', {
          method: 'POST',
          cookie,
          body: { username: `forged_${suffix}`, password, operatorId: member.id },
        });
        assert.equal(rejected.response.status, 400);
        const updated = await call(`/api/admin/users/${member.id}`, {
          method: 'PUT',
          cookie,
          body: { username: member.username, displayName: '修改后的名字' },
        });
        assert.equal(updated.response.status, 200);
        for (const isEnabled of [false, true]) {
          const result = await call(`/api/admin/users/${member.id}/status`, {
            method: 'PUT',
            cookie,
            body: { isEnabled },
          });
          assert.equal(result.response.status, 200);
        }
        const reset = await call(`/api/admin/users/${member.id}/password`, {
          method: 'POST',
          cookie,
          body: { newPassword: `Reset-${randomUUID()}` },
        });
        assert.equal(reset.response.status, 200);
        const logs = await Log.findAll({ where: { userId: member.id }, order: [['id', 'ASC']] });
        assert.deepEqual(
          logs.map((log) => log.action),
          ['USER_CREATED', 'USER_UPDATED', 'USER_DISABLED', 'USER_ENABLED', 'USER_PASSWORD_RESET'],
        );
        assert.ok(
          logs.every(
            (log) => log.operatorId === admin.id && log.operatorUsername === admin.username,
          ),
        );
        assert.deepEqual(logs[0].changes, {
          username: { before: null, after: member.username },
          displayName: { before: null, after: '初始名字' },
          isEnabled: { before: null, after: true },
        });
        assert.deepEqual(logs[1].changes, {
          displayName: { before: '初始名字', after: '修改后的名字' },
        });
        assert.deepEqual(logs[2].changes, { isEnabled: { before: true, after: false } });
        assert.deepEqual(logs[3].changes, { isEnabled: { before: false, after: true } });
        assert.deepEqual(logs[4].changes, {});
        assert.ok(!JSON.stringify(logs).includes(password));
        assert.ok(!JSON.stringify(logs).includes('passwordHash'));
      },
    );

    let category;
    await context.test('category create, update and delete retain field changes', async () => {
      const createdCategory = await call('/api/admin/categories', {
        method: 'POST',
        cookie,
        body: { name: `audit_category_${suffix}`, description: '初始说明', isEnabled: true },
      });
      assert.equal(createdCategory.response.status, 201);
      category = createdCategory.data;
      categoryIds.push(category.id);
      const updated = await call(`/api/admin/categories/${category.id}`, {
        method: 'PUT',
        cookie,
        body: { name: category.name, description: '修改说明', isEnabled: false },
      });
      assert.equal(updated.response.status, 200);
      const deleted = await call(`/api/admin/categories/${category.id}`, {
        method: 'DELETE',
        cookie,
      });
      assert.equal(deleted.response.status, 200);
      const logs = await Log.findAll({
        where: { targetType: 'category', targetId: category.id },
        order: [['id', 'ASC']],
      });
      assert.deepEqual(
        logs.map((log) => log.action),
        ['CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED'],
      );
      assert.deepEqual(logs[1].changes, {
        description: { before: '初始说明', after: '修改说明' },
        isEnabled: { before: true, after: false },
      });
      assert.deepEqual(logs[2].changes.name, { before: category.name, after: null });
      assert.ok(logs.every((log) => log.userId === null));
    });

    await context.test('log queries paginate, filter and reject invalid filters', async () => {
      const result = await call(
        `/api/admin/operation-logs?operatorId=${admin.id}&targetType=user&targetId=${member.id}&pageSize=2&page=2`,
        { cookie },
      );
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.data.pagination, { page: 2, pageSize: 2, total: 5 });
      assert.deepEqual(
        result.data.items.map((item) => item.action),
        ['USER_DISABLED', 'USER_UPDATED'],
      );
      const filtered = await call(
        `/api/admin/operation-logs?operatorId=${admin.id}&action=CATEGORY_DELETED`,
        { cookie },
      );
      assert.equal(filtered.data.pagination.total, 1);
      assert.equal(filtered.data.items[0].targetId, category.id);
      for (const query of ['page=0', 'targetId=invalid', 'action=INVALID', 'targetType=invalid']) {
        assert.equal(
          (await call(`/api/admin/operation-logs?${query}`, { cookie })).response.status,
          400,
        );
      }
    });

    const memberCookie = await createSession(member.id);
    await changeUserBalance(
      member.id,
      {
        direction: 'increase',
        amount: '2.3456',
        reason: '删除回滚验证',
        operationId: randomUUID(),
      },
      admin.id,
    );

    await context.test(
      'failed log writes roll back user data, passwords, cascades and sessions',
      async (subtest) => {
        const snapshot = await User.findByPk(member.id, { raw: true });
        const priorLogs = await Log.count({ where: { operatorId: admin.id } });
        const fault = subtest.mock.method(Log, 'create', async () => {
          throw new Error('Injected operation log failure');
        });
        try {
          const username = `rollback_${suffix}`;
          await assert.rejects(
            createUser({ username, password }, admin.id),
            /Injected operation log/,
          );
          assert.equal(await User.count({ where: { username } }), 0);
          for (const action of [
            () =>
              updateUser(member.id, { username: member.username, displayName: '应回滚' }, admin.id),
            () => updateUserStatus(member.id, { isEnabled: false }, admin.id),
            () =>
              resetUserPassword(member.id, { newPassword: `Rollback-${randomUUID()}` }, admin.id),
            () => deleteUser(member.id, admin.id),
          ]) {
            await assert.rejects(action, /Injected operation log/);
            assert.deepEqual(await User.findByPk(member.id, { raw: true }), snapshot);
            assert.equal(await Session.count({ where: { userId: member.id } }), 1);
            assert.equal(await getBalanceLogModel().count({ where: { userId: member.id } }), 1);
            assert.equal(await Log.count({ where: { operatorId: admin.id } }), priorLogs);
          }
        } finally {
          fault.mock.restore();
        }
        assert.equal((await call('/api/user/me', { cookie: memberCookie })).response.status, 200);
      },
    );

    await context.test(
      'failed log writes roll back category creation, updates and deletion',
      async (subtest) => {
        const fixture = await createCategory(
          { name: `rollback_category_${suffix}`, description: '保留说明', isEnabled: true },
          admin.id,
        );
        categoryIds.push(fixture.id);
        const snapshot = await Category.findByPk(fixture.id, { raw: true });
        const priorLogs = await Log.count({ where: { operatorId: admin.id } });
        const fault = subtest.mock.method(Log, 'create', async () => {
          throw new Error('Injected operation log failure');
        });
        try {
          const name = `failed_category_${suffix}`;
          await assert.rejects(createCategory({ name }, admin.id), /Injected operation log/);
          assert.equal(await Category.count({ where: { name } }), 0);
          for (const action of [
            () =>
              updateCategory(fixture.id, { name: fixture.name, description: '应回滚' }, admin.id),
            () => deleteCategory(fixture.id, admin.id),
          ]) {
            await assert.rejects(action, /Injected operation log/);
            assert.deepEqual(await Category.findByPk(fixture.id, { raw: true }), snapshot);
            assert.equal(await Log.count({ where: { operatorId: admin.id } }), priorLogs);
          }
        } finally {
          fault.mock.restore();
        }
      },
    );

    await context.test(
      'hard deletion clears identifying history and leaves an anonymous event',
      async () => {
        const deleted = await call(`/api/admin/users/${member.id}`, { method: 'DELETE', cookie });
        assert.equal(deleted.response.status, 200);
        assert.equal(await User.findByPk(member.id), null);
        assert.equal(await Session.count({ where: { userId: member.id } }), 0);
        assert.equal(await getBalanceLogModel().count({ where: { userId: member.id } }), 0);
        assert.equal(await Log.count({ where: { userId: member.id } }), 0);
        assert.equal(await Log.count({ where: { targetType: 'user', targetId: member.id } }), 0);
        const events = await Log.findAll({ where: { operatorId: admin.id, targetType: 'user' } });
        assert.equal(events.length, 1);
        assert.equal(events[0].action, 'USER_DELETED');
        assert.equal(events[0].userId, null);
        assert.equal(events[0].targetId, null);
        assert.deepEqual(events[0].changes, {});
        assert.ok(!JSON.stringify(events).includes(member.username));
        assert.equal((await call('/api/user/me', { cookie: memberCookie })).response.status, 401);
      },
    );
  } finally {
    await Category.destroy({ where: { id: categoryIds } });
    await User.destroy({ where: { id: userIds } });
    await database.close();
  }
});
