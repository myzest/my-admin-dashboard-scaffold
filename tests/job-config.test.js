import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('Redis configuration validates protocol and host without requiring a session secret', () => {
  for (const [redisUrl, isValid] of [
    ['redis://127.0.0.1:6379/0', true],
    ['rediss://example.test:6380/1', true],
    ['https://example.test', false],
    ['invalid', false],
    ['redis:///0', false],
    ['redis://', false],
    ['redis:/localhost', false],
  ]) {
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { getJobConfig } from './src/server/config.js';
      delete process.env.SESSION_SECRET;
      if (${isValid}) {
        const config = getJobConfig();
        assert.equal(config.JOB_WORKER_CONCURRENCY, 2);
        assert.equal(config.JOB_QUEUE_PREFIX, 'fixture-jobs');
      } else assert.throws(() => getJobConfig(), /REDIS_URL/);
    `,
      ],
      {
        env: {
          ...process.env,
          REDIS_URL: redisUrl,
          JOB_QUEUE_PREFIX: 'fixture-jobs',
          JOB_WORKER_CONCURRENCY: '2',
        },
        stdio: 'pipe',
      },
    );
  }
});
