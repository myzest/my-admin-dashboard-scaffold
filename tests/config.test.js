import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('database and session settings are validated independently without a site origin', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import assert from 'node:assert/strict';
        import { getDatabaseConfig, getSessionConfig } from './src/server/config.js';
        delete process.env.APP_ORIGIN;
        delete process.env.SESSION_SECRET;
        assert.equal(getDatabaseConfig().DB_NAME, 'config_test');
        assert.throws(() => getSessionConfig(), /SESSION_SECRET/);
        for (const key of Object.keys(process.env)) {
          if (key.startsWith('DB_')) delete process.env[key];
        }
        process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters';
        assert.ok(getSessionConfig().SESSION_SECRET);
        console.log('configuration checks passed');
      `,
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: {
        ...process.env,
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_NAME: 'config_test',
        DB_USER: 'config_test',
        DB_PASSWORD: '',
        DB_POOL_MAX: '10',
      },
      encoding: 'utf8',
    },
  );
  assert.match(output, /configuration checks passed/);
});
