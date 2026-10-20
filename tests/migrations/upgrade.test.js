import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { createMigrator } from '../../database/migrator.js';
import { getDatabase } from '../../src/server/database.js';
import {
  authenticateUser,
  changeUserBalance,
  createUser,
  getUserById,
  seedAdmin,
} from '../../src/modules/users/server.js';
import {
  getRegistrationSettings,
  updateRegistrationSettings,
} from '../../src/modules/settings/server.js';

assert.ok(
  process.env.DB_NAME?.endsWith('_migration_test'),
  '迁移测试必须显式使用空的、名称以 _migration_test 结尾的独立数据库',
);

const initialMigration = '001-initial.js';
const accountMigration = '002-users-balances-settings.js';
const ownedTables = [
  'balance_logs',
  'sessions',
  'admin_sessions',
  'users',
  'admins',
  'system_settings',
  'categories',
  'sequelize_meta',
];

test('real MySQL: fresh setup, legacy upgrade and interrupted DDL recovery', async (context) => {
  const database = getDatabase();
  const queryInterface = database.getQueryInterface();
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousPassword = process.env.ADMIN_PASSWORD;
  const password = `Migration-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 4);
  const now = new Date();
  const sessionId = randomUUID();

  async function cleanCompletedFixture() {
    const tables = await queryInterface.showAllTables();
    for (const table of ownedTables) {
      if (tables.includes(table)) await queryInterface.dropTable(table);
    }
  }

  async function scenario(name, run) {
    let completed = false;
    await context.test(name, async (subtest) => {
      await run(subtest);
      completed = true;
    });
    // Keep a failed fixture intact for diagnosis; never reset a pre-existing database.
    if (completed) await cleanCompletedFixture();
    return completed;
  }

  async function createLegacyFixture() {
    const migrator = createMigrator();
    await migrator.up({ to: initialMigration });
    await queryInterface.bulkInsert('admins', [
      {
        id: 41,
        username: 'legacy_admin',
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      },
    ]);
    await queryInterface.bulkInsert('admin_sessions', [
      {
        id: sessionId,
        admin_id: 41,
        expires_at: new Date(now.getTime() + 3600000),
        created_at: now,
      },
    ]);
    await queryInterface.bulkInsert('categories', [
      {
        id: 29,
        name: 'existing-category',
        description: '迁移前已有数据',
        is_enabled: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    return migrator;
  }

  async function verifyLegacyUpgrade(migrator) {
    assert.deepEqual(
      (await migrator.executed()).map(({ name }) => name),
      [initialMigration, accountMigration],
    );
    const [[admin]] = await database.query('SELECT * FROM users WHERE id = 41');
    assert.equal(admin.username, 'legacy_admin');
    assert.equal(admin.password_hash, passwordHash);
    assert.equal(admin.role, 'admin');
    assert.equal(admin.display_name, 'legacy_admin');
    assert.equal(admin.balance, '0.0000');
    assert.equal((await authenticateUser({ username: 'legacy_admin', password })).id, 41);
    const [[session]] = await database.query('SELECT * FROM sessions WHERE id = :id', {
      replacements: { id: sessionId },
    });
    assert.equal(session.user_id, 41);
    assert.equal(Object.hasOwn(session, 'admin_id'), false);
    const [[category]] = await database.query('SELECT * FROM categories WHERE id = 29');
    assert.equal(category.description, '迁移前已有数据');
    assert.deepEqual(await getRegistrationSettings(), { allowRegistration: false });
    assert.deepEqual(await seedAdmin(), { created: false });
    const tables = await queryInterface.showAllTables();
    assert.ok(!tables.includes('admins') && !tables.includes('admin_sessions'));
    const [indexes] = await database.query(
      "SHOW INDEX FROM balance_logs WHERE Key_name = 'balance_logs_user_operation'",
    );
    assert.equal(indexes.length, 2);
    assert.ok(indexes.every((index) => Number(index.Non_unique) === 0));
    await queryInterface.bulkInsert('users', [
      {
        username: 'default_role_user',
        password_hash: passwordHash,
        created_at: now,
        updated_at: now,
      },
    ]);
    const [[ordinaryUser]] = await database.query(
      "SELECT role, balance FROM users WHERE username = 'default_role_user'",
    );
    assert.equal(ordinaryUser.role, 'user');
    assert.equal(ordinaryUser.balance, '0.0000');
    await queryInterface.bulkDelete('users', { id: 41 });
    const [remainingSessions] = await database.query('SELECT id FROM sessions WHERE id = :id', {
      replacements: { id: sessionId },
    });
    assert.deepEqual(remainingSessions, []);
  }

  try {
    assert.deepEqual(
      await queryInterface.showAllTables(),
      [],
      '迁移测试不会覆盖已有表，请提供空数据库',
    );
    process.env.ADMIN_USERNAME = `migration_admin_${randomUUID().slice(0, 8)}`;
    process.env.ADMIN_PASSWORD = password;

    if (
      !(await scenario(
        'fresh setup and repeated setup preserve users, balances and settings',
        async () => {
          const migrator = createMigrator();
          await migrator.up();
          assert.deepEqual(await seedAdmin(), { created: true });
          const admin = await authenticateUser({ username: process.env.ADMIN_USERNAME, password });
          assert.equal(admin.role, 'admin');
          assert.equal(admin.balance, '0.0000');
          const user = await createUser({
            username: 'existing_member',
            displayName: '已有用户',
            password,
          });
          await changeUserBalance(
            user.id,
            {
              direction: 'increase',
              amount: '1234567890123456.7890',
              reason: '保留已有余额',
              operationId: randomUUID(),
            },
            admin.id,
          );
          await updateRegistrationSettings({ allowRegistration: true });
          assert.deepEqual(await migrator.up(), []);
          assert.deepEqual(await seedAdmin(), { created: false });
          // Simulate completion before Umzug recorded the migration, then replay the actual runner.
          await queryInterface.bulkDelete('sequelize_meta', { name: accountMigration });
          await migrator.up();
          const retained = await getUserById(user.id);
          assert.equal(retained.role, 'user');
          assert.equal(retained.displayName, '已有用户');
          assert.equal(retained.balance, '1234567890123456.7890');
          assert.deepEqual(await getRegistrationSettings(), { allowRegistration: true });
          const [[logs]] = await database.query(
            'SELECT COUNT(*) AS total FROM balance_logs WHERE user_id = :id',
            {
              replacements: { id: user.id },
            },
          );
          assert.equal(Number(logs.total), 1);
          assert.equal(
            (await authenticateUser({ username: admin.username, password })).id,
            admin.id,
          );
        },
      ))
    )
      return;

    if (
      !(await scenario(
        'existing administrator, session and category survive an ordinary upgrade',
        async () => {
          const migrator = await createLegacyFixture();
          await migrator.up();
          await verifyLegacyUpgrade(migrator);
        },
      ))
    )
      return;

    const checkpoints = [
      {
        name: 'user table rename',
        method: 'renameTable',
        matches: ([table]) => table === 'admins',
      },
      {
        name: 'administrator role backfill',
        method: 'addColumn',
        matches: ([table, column]) => table === 'users' && column === 'role',
      },
      {
        name: 'session foreign-key column rename',
        method: 'renameColumn',
        matches: ([table]) => table === 'sessions',
      },
      {
        name: 'balance-log table creation',
        method: 'createTable',
        matches: ([table]) => table === 'balance_logs',
      },
      {
        name: 'settings table creation',
        method: 'createTable',
        matches: ([table]) => table === 'system_settings',
      },
    ];
    for (const { name, method, matches } of checkpoints) {
      const completed = await scenario(
        `upgrade resumes after committed ${name}`,
        async (subtest) => {
          const migrator = await createLegacyFixture();
          const original = queryInterface[method].bind(queryInterface);
          const fault = subtest.mock.method(queryInterface, method, async (...args) => {
            const result = await original(...args);
            if (matches(args))
              throw new Error('Injected migration interruption after committed DDL');
            return result;
          });
          try {
            await assert.rejects(migrator.up(), /Injected migration interruption/);
          } finally {
            fault.mock.restore();
          }
          assert.deepEqual(
            (await migrator.executed()).map(({ name: migrationName }) => migrationName),
            [initialMigration],
          );
          await migrator.up();
          await verifyLegacyUpgrade(migrator);
        },
      );
      if (!completed) return;
    }
  } finally {
    if (previousUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    await database.close();
  }
});
