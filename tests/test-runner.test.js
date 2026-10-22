import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import {
  createTestEnvironment,
  getManagedTestUrl,
  getTestBuildDirectory,
} from '../scripts/test-config.js';

const config = {
  DB_HOST: '127.0.0.1',
  DB_NAME: 'isolated_test',
  DB_USER: 'isolated_runner',
  DB_PASSWORD: '',
  ADMIN_USERNAME: 'test_admin',
  ADMIN_PASSWORD: 'test-only-password',
};

function withConfig(values, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-starter-test-config-'));
  const filename = path.join(directory, '.env.test.local');
  try {
    if (values) {
      writeFileSync(
        filename,
        Object.entries(values)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      );
    }
    run(filename);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('isolated tests require their own complete config and never fall back to business settings', () => {
  withConfig(null, (filename) => {
    assert.throws(() => createTestEnvironment(filename, config), /缺少 .env.test.local/);
  });
  for (const values of [
    { ...config, DB_NAME: 'business' },
    { ...config, DB_HOST: '' },
  ]) {
    withConfig(values, (filename) => {
      assert.throws(() => createTestEnvironment(filename, config), /测试配置无效/);
    });
  }
  const { DB_PASSWORD: omitted, ...withoutPassword } = config;
  assert.equal(omitted, '');
  withConfig(withoutPassword, (filename) => {
    assert.throws(() => createTestEnvironment(filename, config), /DB_PASSWORD/);
  });
  withConfig({ ...config, TEST_BASE_URL: 'https://business.invalid' }, (filename) => {
    assert.throws(() => createTestEnvironment(filename), /测试配置无效/);
  });
});

test('runner owns the database config, session secret, build identity and target address', () => {
  withConfig(config, (filename) => {
    const environment = createTestEnvironment(filename, {
      PATH: '/example/bin',
      DB_NAME: 'business',
      DB_PORT: '3333',
      DB_PASSWORD: 'business-password',
      ADMIN_PASSWORD: 'business-admin-password',
      SESSION_SECRET: 'business-session-secret',
      REDIS_URL: 'redis://business.invalid:6379',
      JOB_QUEUE_PREFIX: 'business',
      TRUSTED_PROXY_IPS: '127.0.0.1',
      TEST_BASE_URL: 'http://127.0.0.1:3000',
      TEST_RUN_ID: '../../outside',
    });
    assert.equal(environment.PATH, '/example/bin');
    assert.equal(environment.DB_NAME, 'isolated_test');
    assert.equal(environment.DB_PORT, '3306');
    assert.equal(environment.DB_PASSWORD, '');
    assert.equal(environment.ADMIN_PASSWORD, config.ADMIN_PASSWORD);
    assert.equal(environment.TRUSTED_PROXY_IPS, '');
    assert.equal(environment.SESSION_SECRET.length, 64);
    assert.equal(environment.TEST_BASE_URL, undefined);
    assert.equal(environment.REDIS_URL, undefined);
    assert.equal(environment.JOB_QUEUE_PREFIX, undefined);
    assert.match(getTestBuildDirectory(environment.TEST_RUN_ID), /^\.local\/test-build-/);
    assert.throws(() => getTestBuildDirectory('../../outside'), /测试运行标识无效/);
  });
});

test('test clients reject unmanaged or external targets before sending any requests', () => {
  const environment = {
    DB_NAME: 'isolated_test',
    TEST_RUN_ID: randomUUID(),
    TEST_BASE_URL: 'http://127.0.0.1:43210',
  };
  assert.equal(getManagedTestUrl(environment), environment.TEST_BASE_URL);
  for (const url of ['https://business.invalid', 'http://127.0.0.1:43210/unrelated']) {
    assert.throws(() => getManagedTestUrl({ ...environment, TEST_BASE_URL: url }), /本机服务/);
  }
  assert.throws(() => getManagedTestUrl({ ...environment, DB_NAME: 'business' }), /本机服务/);
  for (const modulePath of ['./tests/helpers/api.js', './playwright.config.mjs']) {
    const env = {
      ...process.env,
      DB_NAME: 'isolated_test',
      TEST_BASE_URL: environment.TEST_BASE_URL,
    };
    delete env.TEST_RUN_ID;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `import '${modulePath}'`],
      {
        env,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm run test:integration/);
  }
});

test('Next environment expansion cannot change the runner database configuration', () => {
  withConfig(
    { ...config, DB_PASSWORD: 'test$EXPANSION', ADMIN_PASSWORD: 'admin$EXPANSION' },
    (filename) => {
      const directory = path.dirname(filename);
      const root = fileURLToPath(new URL('../', import.meta.url));
      const env = createTestEnvironment(filename, { ...process.env, EXPANSION: '-changed' });
      delete env.__NEXT_PROCESSED_ENV;
      writeFileSync(
        path.join(directory, '.env.local'),
        'DB_PASSWORD=business\nADMIN_PASSWORD=business\n',
      );
      // Editing the source after launch must not alter the runner's configuration snapshot.
      writeFileSync(filename, 'DB_NAME=edited_after_launch_test\n');
      copyFileSync(path.join(root, 'next.config.mjs'), path.join(directory, 'next.config.mjs'));
      symlinkSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), 'dir');
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import assert from 'node:assert/strict';
        import nextEnv from '@next/env';
        nextEnv.loadEnvConfig(${JSON.stringify(directory)}, false);
        assert.equal(process.env.DB_PASSWORD, 'test-changed');
        await import(${JSON.stringify(pathToFileURL(path.join(directory, 'next.config.mjs')).href)});
        const { getDatabaseConfig } = await import(${JSON.stringify(new URL('../src/server/config.js', import.meta.url).href)});
        assert.equal(getDatabaseConfig().DB_PASSWORD, 'test$EXPANSION');
        assert.equal(getDatabaseConfig().DB_NAME, 'isolated_test');
        assert.equal(process.env.ADMIN_PASSWORD, 'admin$EXPANSION');`,
        ],
        { cwd: root, env, encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
    },
  );
});
