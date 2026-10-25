import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('an application crash fails the runner and stops its tests before cleaning the build', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-starter-runner-crash-'));
  try {
    for (const name of ['scripts', 'tests/helpers', 'tests/integration', 'node_modules/next']) {
      mkdirSync(path.join(directory, name), { recursive: true });
    }
    for (const name of ['test.js', 'test-config.js']) {
      copyFileSync(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
    }
    symlinkSync(path.join(root, 'src'), path.join(directory, 'src'), 'dir');
    for (const name of ['dotenv', 'zod']) {
      symlinkSync(
        path.join(root, 'node_modules', name),
        path.join(directory, 'node_modules', name),
        'dir',
      );
    }
    const write = (name, contents) => writeFileSync(path.join(directory, name), contents);
    write('package.json', '{"type":"module"}');
    write(
      '.env.test.local',
      'DB_HOST=127.0.0.1\nDB_NAME=fixture_test\nDB_USER=fixture\nDB_PASSWORD=\nADMIN_USERNAME=admin\nADMIN_PASSWORD=123456\n',
    );
    // Keep the real runner and Node test subprocesses; no database or build is needed.
    write('scripts/database.js', 'process.exit(0);');
    write(
      'tests/helpers/redis.js',
      `import { writeFileSync } from 'node:fs';
      export async function createTestRedis(context) {
        context.after(() => writeFileSync('redis-stopped', ''));
        return { url: 'redis://127.0.0.1:43211/0' };
      }`,
    );
    write(
      'node_modules/next/package.json',
      '{"type":"module","exports":{"./dist/bin/next":"./build.js"}}',
    );
    write('node_modules/next/build.js', 'process.exit(0);');
    write(
      'scripts/test-server.js',
      `import { existsSync } from 'node:fs';
      process.send({ type: 'ready', port: 43210 });
      setInterval(() => { if (existsSync('test-started')) process.exit(17); }, 10);`,
    );
    write(
      'tests/integration/fixture.test.js',
      `import { test } from 'node:test';
      import { writeFileSync } from 'node:fs';
      import { setTimeout } from 'node:timers/promises';
      test('pending test', async () => {
        writeFileSync('test-started', '');
        await setTimeout(2000);
        writeFileSync('test-completed', '');
      });`,
    );
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['scripts/test.js', 'integration'], {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /17/);
    assert.equal(existsSync(path.join(directory, 'test-completed')), false);
    assert.equal(existsSync(path.join(directory, 'redis-stopped')), true);
    assert.deepEqual(readdirSync(path.join(directory, '.local')), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
