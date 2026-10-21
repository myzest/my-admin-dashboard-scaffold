import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('administrator recovery rejects non-interactive input without echoing passwords', () => {
  const password = 'Do-not-print-this-test-password';
  const result = spawnSync(process.execPath, ['scripts/reset-admin-password.js', password], {
    input: `${password}\n`,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /交互式终端/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(password));
});
