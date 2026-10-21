import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { getClientAddress } from '../src/server/client-address.js';
import { login, register } from '../src/modules/auth/service.js';

process.env.TRUSTED_PROXY_IPS = '127.0.0.1, ::1';

function request(peer, forwarded) {
  return { socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': forwarded } };
}

test('forwarded client IPs are accepted only from explicitly trusted peers', () => {
  assert.equal(getClientAddress(request('127.0.0.1', '192.0.2.1')), '192.0.2.1');
  assert.equal(getClientAddress(request('::1', '192.0.2.2')), '192.0.2.2');
  assert.equal(getClientAddress(request('198.51.100.1', '192.0.2.1')), '198.51.100.1');
  assert.equal(getClientAddress(request(undefined, '192.0.2.1')), 'unknown');
});

test('missing, malformed and multi-value forwarding headers fall back to the peer', () => {
  for (const header of [
    undefined,
    '',
    'unknown',
    '192.0.2.1:3000',
    '192.0.2.1, 192.0.2.2',
    ['192.0.2.1'],
    'fe80::1%lo0',
  ]) {
    assert.equal(getClientAddress(request('127.0.0.1', header)), '127.0.0.1');
  }
});

test('equivalent IP representations share a canonical client identity', () => {
  assert.equal(getClientAddress(request('::ffff:127.0.0.1', '::ffff:c000:201')), '192.0.2.1');
  assert.equal(getClientAddress(request('0:0:0:0:0:0:0:1', '2001:0DB8:0:0::0001')), '2001:db8::1');
  assert.equal(getClientAddress(request('::ffff:198.51.100.1', '192.0.2.1')), '198.51.100.1');
});

test('proxy configuration defaults to no trust and rejects non-IP entries', () => {
  const script = `
    import { getClientAddress } from './src/server/client-address.js';
    console.log(getClientAddress({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '192.0.2.1' },
    }));
  `;
  assert.equal(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TRUSTED_PROXY_IPS: '' },
      encoding: 'utf8',
    }).trim(),
    '127.0.0.1',
  );
  for (const value of ['*', 'true', 'localhost', '127.0.0.0/8', '127.0.0.1,', 'fe80::1%lo0']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TRUSTED_PROXY_IPS: value },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /环境配置无效，请检查：TRUSTED_PROXY_IPS/);
  }
});

test('login and registration quotas isolate trusted clients and reject spoofed peers', async (context) => {
  const reachedDatabase = new Error('Authentication limiter allowed the request');
  const previousDatabase = globalThis.adminStarterDatabase;
  globalThis.adminStarterDatabase = {
    models: {
      Session: {
        destroy: async () => {
          throw reachedDatabase;
        },
      },
    },
    transaction: async () => {
      throw reachedDatabase;
    },
  };
  context.after(() => {
    if (previousDatabase === undefined) delete globalThis.adminStarterDatabase;
    else globalThis.adminStarterDatabase = previousDatabase;
  });

  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };
  for (const [action, code] of [
    [login, 'LOGIN_RATE_LIMITED'],
    [register, 'REGISTRATION_RATE_LIMITED'],
  ]) {
    const allowed = (req) =>
      assert.rejects(action(req, response, {}), (error) => error === reachedDatabase);
    for (let index = 0; index < 10; index++) {
      await allowed(request('127.0.0.1', '192.0.2.10'));
      await allowed(request('127.0.0.1', '192.0.2.11'));
    }
    for (const address of ['192.0.2.10', '::ffff:c000:20b']) {
      await assert.rejects(action(request('127.0.0.1', address), response, {}), {
        status: 429,
        code,
      });
    }
    assert.ok(headers.get('Retry-After') > 0);

    for (let index = 1; index <= 10; index++) {
      await allowed(request('198.51.100.20', `192.0.2.${index}`));
    }
    await assert.rejects(action(request('198.51.100.20', '192.0.2.99'), response, {}), {
      status: 429,
      code,
    });
  }
});
