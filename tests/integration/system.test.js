import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { baseUrl, call } from '../helpers/api.js';

assert.ok(process.env.DB_NAME?.endsWith('_test'), '集成测试必须使用名称以 _test 结尾的独立数据库');
const credentials = { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD };

test('real MySQL: authentication, validation, CRUD, concurrency and session revocation', async (context) => {
  const database = getDatabase();
  const createdIds = new Set();
  let cookie;
  let admin;
  try {
    await context.test('unauthenticated pages and API reject access', async () => {
      const page = await fetch(`${baseUrl}/categories`, { redirect: 'manual' });
      assert.equal(page.status, 307);
      assert.equal(page.headers.get('location'), '/login');
      const api = await call('/api/categories');
      assert.equal(api.response.status, 401);
      assert.equal(api.payload.error.code, 'UNAUTHENTICATED');
    });

    await context.test(
      'malformed JSON and invalid credentials use the error contract',
      async () => {
        assert.equal(
          (await call('/api/auth/login', { method: 'POST', raw: '{' })).response.status,
          400,
        );
        assert.equal(
          (
            await call('/api/auth/login', {
              method: 'POST',
              body: { ...credentials, password: 'incorrect-password' },
            })
          ).response.status,
          401,
        );
        assert.equal(
          (await call('/api/auth/me', { method: 'POST', raw: '{' })).response.status,
          405,
        );
        const oversized = await call('/api/auth/login', {
          method: 'POST',
          raw: JSON.stringify({ value: 'a'.repeat(65537) }),
        });
        assert.equal(oversized.response.status, 413);
      },
    );

    await context.test('write requests do not require a fixed Origin', async () => {
      for (const origin of [
        undefined,
        new URL(baseUrl).origin,
        `${new URL(baseUrl).protocol}//${new URL(baseUrl).hostname}`,
        'http://localhost:3000',
        'https://other.example',
        'null',
      ]) {
        const result = await call('/api/auth/login', { method: 'POST', body: {}, origin });
        assert.equal(result.response.status, 400);
        assert.equal(result.payload.error.code, 'VALIDATION_ERROR');
      }
    });

    await context.test('non-JSON writes and cross-origin preflights remain rejected', async () => {
      for (const contentType of [
        'text/plain',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=test',
      ]) {
        const result = await call('/api/auth/login', {
          method: 'POST',
          contentType,
          origin: 'https://other.example',
        });
        assert.equal(result.response.status, 415);
        assert.equal(result.payload.error.code, 'INVALID_CONTENT_TYPE');
      }
      for (const path of ['/api/auth/login', '/api/categories']) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://other.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        assert.equal(response.status, 405);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
      }
    });

    await context.test(
      'login issues an HttpOnly cookie and only exposes public user fields',
      async () => {
        const result = await call('/api/auth/login', { method: 'POST', body: credentials });
        assert.equal(result.response.status, 200);
        const setCookie = result.response.headers.get('set-cookie');
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=Lax/i);
        assert.doesNotMatch(setCookie, /;\s*Secure(?:;|$)/i);
        cookie = setCookie.split(';')[0];
        assert.match(cookie, /^starter_session=/);
        admin = result.data.user;
        assert.equal(admin.role, 'admin');
        assert.match(admin.balance, /^\d+\.\d{4}$/);
        assert.equal(Object.hasOwn(admin, 'passwordHash'), false);
        assert.equal(Object.hasOwn(admin, 'password'), false);
        assert.deepEqual((await call('/api/auth/me', { cookie })).data.user, admin);
        const page = await fetch(`${baseUrl}/categories`, { headers: { Cookie: cookie } });
        assert.equal(page.status, 200);
        assert.match(page.headers.get('cache-control'), /no-store/);
        assert.ok(!(await page.text()).includes('passwordHash'));
      },
    );

    const name = `integration-${randomUUID().slice(0, 8)}`;
    let categoryId;
    await context.test(
      'create, search, update and pagination use real persistent rows',
      async () => {
        const created = await call('/api/categories', {
          method: 'POST',
          cookie,
          body: { name, description: '测试说明', isEnabled: true },
        });
        assert.equal(created.response.status, 201);
        categoryId = created.data.id;
        createdIds.add(categoryId);
        const listed = await call(
          `/api/categories?search=${encodeURIComponent(name)}&page=1&pageSize=1&_t=1`,
          { cookie },
        );
        assert.equal(listed.data.items[0].id, categoryId);
        assert.deepEqual(listed.data.pagination, { page: 1, pageSize: 1, total: 1 });
        const updated = await call(`/api/categories/${categoryId}`, {
          method: 'PUT',
          cookie,
          origin: 'http://localhost:3000',
          body: { name, description: '已修改', isEnabled: false },
        });
        assert.equal(updated.data.isEnabled, false);
        assert.equal(
          (await call(`/api/categories/${categoryId}`, { cookie })).data.description,
          '已修改',
        );
        const [rows] = await database.query('SELECT is_enabled FROM categories WHERE id = :id', {
          replacements: { id: categoryId },
        });
        assert.equal(rows[0].is_enabled, 0);
      },
    );

    await context.test(
      'reject duplicate names, invalid fields and excessive page sizes',
      async () => {
        assert.equal(
          (await call('/api/categories', { method: 'POST', cookie, body: { name } })).response
            .status,
          409,
        );
        assert.equal(
          (await call('/api/categories', { method: 'POST', cookie, body: { name: '   ' } }))
            .response.status,
          400,
        );
        assert.equal(
          (await call('/api/categories', { method: 'POST', cookie, body: { name, id: 500 } }))
            .response.status,
          400,
        );
        assert.equal((await call('/api/categories?pageSize=101', { cookie })).response.status, 400);
        assert.equal(
          (
            await call(`/api/categories/${categoryId}`, {
              method: 'DELETE',
              cookie,
              contentType: 'text/plain',
            })
          ).response.status,
          415,
        );
      },
    );

    await context.test('concurrent identical creates yield exactly one row', async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          call('/api/categories', {
            method: 'POST',
            cookie,
            body: { name: `${name}-parallel` },
          }),
        ),
      );
      assert.equal(results.filter((result) => result.response.status === 201).length, 1);
      assert.equal(results.filter((result) => result.response.status === 409).length, 3);
      for (const result of results) if (result.response.ok) createdIds.add(result.data.id);
    });

    await context.test('search treats percent and underscore as literal characters', async () => {
      const literalName = `${name}%_`;
      const created = await call('/api/categories', {
        method: 'POST',
        cookie,
        body: { name: literalName },
      });
      assert.equal(created.response.status, 201);
      createdIds.add(created.data.id);
      const result = await call(`/api/categories?search=${encodeURIComponent(literalName)}`, {
        cookie,
      });
      assert.equal(result.data.pagination.total, 1);
      assert.equal(result.data.items[0].name, literalName);
    });

    await context.test('delete returns not-found on repeat', async () => {
      assert.equal(
        (await call(`/api/categories/${categoryId}`, { method: 'DELETE', cookie })).response.status,
        200,
      );
      createdIds.delete(categoryId);
      assert.equal(
        (await call(`/api/categories/${categoryId}`, { method: 'DELETE', cookie })).response.status,
        404,
      );
    });

    await context.test(
      'expired stored sessions cannot be used even with a valid sealed cookie',
      async () => {
        const sessionId = randomUUID();
        await database.query(
          'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (:id, :userId, :expired, :created)',
          {
            replacements: {
              id: sessionId,
              userId: admin.id,
              expired: new Date(0),
              created: new Date(),
            },
          },
        );
        try {
          const sealed = await sealData(
            { sessionId },
            { password: process.env.SESSION_SECRET, ttl: 3600 },
          );
          const result = await call('/api/auth/me', { cookie: `starter_session=${sealed}` });
          assert.equal(result.response.status, 401);
        } finally {
          await database.query('DELETE FROM sessions WHERE id = :id', {
            replacements: { id: sessionId },
          });
        }
      },
    );

    await context.test('logout revokes a copied cookie on the server', async () => {
      assert.equal(
        (await call('/api/auth/logout', { method: 'POST', cookie })).response.status,
        200,
      );
      assert.equal((await call('/api/auth/me', { cookie })).response.status, 401);
    });
  } finally {
    for (const id of createdIds) {
      await database.query('DELETE FROM categories WHERE id = :id', { replacements: { id } });
    }
    if (cookie) await call('/api/auth/logout', { method: 'POST', cookie });
    await database.close();
  }
});
