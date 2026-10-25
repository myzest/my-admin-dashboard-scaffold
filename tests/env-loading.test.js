import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTestEnvironment } from '../scripts/test-config.js';

const loaderUrl = new URL('../scripts/load-env.js', import.meta.url).href;
const nextEnvUrl = import.meta.resolve('@next/env');
const keys = [
  'NODE_ENV',
  'DB_HOST',
  'DB_NAME',
  'DB_PASSWORD',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'ENV_INHERITED',
  'ENV_MODE',
  'ENV_LOCAL',
  'ENV_BASE',
];

function withEnvironmentFiles(files, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-starter-env-loading-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(directory, name), contents);
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function readEnvironment(
  directory,
  overrides,
  code = `await import(${JSON.stringify(loaderUrl)});`,
) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(DB_|ADMIN_|SESSION_|TEST_|ENV_|TRUSTED_PROXY_IPS$|NODE_ENV$|npm_lifecycle_event$|__NEXT_PROCESSED_ENV$)/.test(
          key,
        ),
    ),
  );
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `${code}
      console.log(JSON.stringify(Object.fromEntries(
        ${JSON.stringify(keys)}.map(key => [key, process.env[key] ?? null])
      )));`,
    ],
    { cwd: directory, env: { ...environment, ...overrides }, encoding: 'utf8' },
  );
  return JSON.parse(output);
}

function readNextEnvironment(directory, environment, isDevelopment) {
  return readEnvironment(
    directory,
    environment,
    `import nextEnv from ${JSON.stringify(nextEnvUrl)};
    nextEnv.loadEnvConfig(process.cwd(), ${isDevelopment});`,
  );
}

test('CLI and Next agree on literal dollars, interpolation and shell precedence', () => {
  withEnvironmentFiles(
    {
      '.env': 'ENV_BASE=base\nENV_LOCAL=base\n',
      '.env.local':
        'ENV_SUFFIX=expanded\nDB_PASSWORD=literal\\$ENV_SUFFIX\nADMIN_PASSWORD=prefix${ENV_SUFFIX}\nENV_LOCAL=local\nENV_INHERITED=file\n',
    },
    (directory) => {
      const environment = { NODE_ENV: 'production', ENV_INHERITED: 'shell' };
      const actual = readEnvironment(directory, environment);
      assert.deepEqual(actual, readNextEnvironment(directory, environment, false));
      assert.equal(actual.DB_PASSWORD, 'literal$ENV_SUFFIX');
      assert.equal(actual.ADMIN_PASSWORD, 'prefixexpanded');
      assert.equal(actual.ENV_INHERITED, 'shell');
      assert.equal(actual.ENV_LOCAL, 'local');
      assert.equal(actual.ENV_BASE, 'base');
    },
  );
});

test('maintenance defaults to production and explicit modes match Next environment loading', () => {
  withEnvironmentFiles(
    {
      '.env': 'ENV_MODE=base\n',
      '.env.local': 'ENV_LOCAL=local\nENV_MODE=local\n',
      '.env.development': 'ENV_MODE=development\n',
      '.env.development.local': 'ENV_MODE=development-local\n',
      '.env.production': 'ENV_MODE=production\n',
      '.env.production.local': 'ENV_MODE=production-local\n',
      '.env.test': 'ENV_MODE=test\n',
    },
    (directory) => {
      for (const [environment, isDevelopment, nodeEnvironment, expectedMode] of [
        [{}, false, 'production', 'production-local'],
        [{ NODE_ENV: 'development' }, true, 'development', 'development-local'],
        [{ NODE_ENV: 'test' }, false, 'test', 'test'],
      ]) {
        const actual = readEnvironment(directory, environment);
        assert.deepEqual(
          actual,
          readNextEnvironment(
            directory,
            { ...environment, NODE_ENV: nodeEnvironment },
            isDevelopment,
          ),
        );
        assert.equal(actual.ENV_MODE, expectedMode);
        assert.equal(actual.ENV_LOCAL, nodeEnvironment === 'test' ? null : 'local');
      }
    },
  );
});

test('managed test scripts restore their snapshot without reading business env files', () => {
  withEnvironmentFiles(
    {
      '.env.test.local':
        'DB_HOST=127.0.0.1\nDB_NAME=isolated_test\nDB_USER=isolated\nDB_PASSWORD=test$ENV_SUFFIX\nADMIN_USERNAME=test_admin\nADMIN_PASSWORD=admin$ENV_SUFFIX\n',
      '.env.local': 'DB_NAME=business\nDB_PASSWORD=business\nENV_LOCAL=business\n',
      '.env.production.local': 'DB_HOST=business.invalid\n',
    },
    (directory) => {
      const environment = createTestEnvironment(path.join(directory, '.env.test.local'), {
        ENV_SUFFIX: '-expanded',
        DB_NAME: 'inherited-business',
      });
      const actual = readEnvironment(directory, {
        ...environment,
        DB_NAME: 'changed-after-snapshot',
        DB_PASSWORD: 'changed-after-snapshot',
      });
      assert.equal(actual.DB_HOST, '127.0.0.1');
      assert.equal(actual.DB_NAME, 'isolated_test');
      assert.equal(actual.DB_PASSWORD, 'test$ENV_SUFFIX');
      assert.equal(actual.ADMIN_PASSWORD, 'admin$ENV_SUFFIX');
      assert.equal(actual.SESSION_SECRET, environment.SESSION_SECRET);
      assert.equal(actual.ENV_LOCAL, null);
    },
  );
});
