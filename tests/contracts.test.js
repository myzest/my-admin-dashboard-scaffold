import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from '../src/lib/request.js';
import { categorySchema, categoryQuerySchema } from '../src/modules/categories/schema.js';
import { loginSchema } from '../src/modules/auth/schema.js';
import {
  changePasswordSchema,
  createUserSchema,
  initialAdminSchema,
  passwordSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../src/modules/users/schema.js';

test('input boundaries reject mass assignment, invalid pagination and bcrypt truncation', () => {
  assert.throws(() => categorySchema.parse({ name: '   ' }));
  assert.throws(() => categorySchema.parse({ name: 'valid', adminId: 1 }));
  assert.throws(() => categorySchema.parse({ name: 'valid', isEnabled: 'false' }));
  assert.throws(() => categoryQuerySchema.parse({ page: '0' }));
  assert.throws(() => categoryQuerySchema.parse({ pageSize: '101' }));
  assert.throws(() => loginSchema.parse({ username: 'admin', password: '密'.repeat(25) }));
  assert.throws(() => initialAdminSchema.parse({ username: 'admin6', password: 'short' }));
});

test('account writes require five-character usernames and six-character passwords, including numeric passwords', () => {
  const credentials = { username: 'user5', password: '123456' };
  for (const schema of [createUserSchema, initialAdminSchema]) {
    assert.equal(schema.parse(credentials).password, '123456');
    assert.throws(() => schema.parse({ ...credentials, username: 'user' }));
    assert.throws(() => schema.parse({ ...credentials, password: '12345' }));
  }
  assert.equal(updateUserSchema.parse({ username: '12345' }).username, '12345');
  assert.throws(() => updateUserSchema.parse({ username: 'user' }));
  for (const schema of [resetPasswordSchema, changePasswordSchema]) {
    const values = {
      ...(schema === changePasswordSchema ? { currentPassword: 'legacy-password' } : {}),
      newPassword: '123456',
    };
    assert.equal(schema.parse(values).newPassword, '123456');
    assert.throws(() => schema.parse({ ...values, newPassword: '12345' }));
  }
  assert.equal(passwordSchema.parse('密'.repeat(24)), '密'.repeat(24));
  assert.throws(() => passwordSchema.parse('密'.repeat(25)));
  assert.deepEqual(loginSchema.parse({ username: 'root', password: '123456' }), {
    username: 'root',
    password: '123456',
  });
});

test('list queries ignore extra fields while validating supported filters', () => {
  assert.deepEqual(categoryQuerySchema.parse({ page: '2', search: ' news ', _t: '123' }), {
    page: 2,
    pageSize: 10,
    search: 'news',
  });
  assert.throws(() => categoryQuerySchema.parse({ pageSize: 'invalid', _t: '123' }));
});

test('request sends JSON for bodyless writes and preserves server errors', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.body, '{}');
    assert.equal(options.headers['Content-Type'], 'application/json');
    return Response.json(
      { status: false, data: {}, error: { code: 'CONFLICT', message: '名称重复' } },
      { status: 409 },
    );
  });
  await assert.rejects(request('/api/example', { method: 'DELETE' }), {
    name: 'ApiError',
    status: 409,
    code: 'CONFLICT',
    message: '名称重复',
  });
});

test('request surfaces malformed responses and retains cancellations', async (context) => {
  const fetchMock = context.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>error</html>', { status: 502 }),
  );
  await assert.rejects(request('/api/example'), { status: 502, code: 'INVALID_RESPONSE' });
  fetchMock.mock.mockImplementation(async () => Response.json({ status: true }));
  await assert.rejects(request('/api/example'), { code: 'INVALID_RESPONSE' });
  fetchMock.mock.mockImplementation(async () => {
    throw new DOMException('Cancelled', 'AbortError');
  });
  await assert.rejects(request('/api/example'), { name: 'AbortError' });
});
