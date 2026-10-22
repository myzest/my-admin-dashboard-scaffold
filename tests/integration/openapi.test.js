import '../../scripts/load-env.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { text } from 'node:stream/consumers';
import { test } from 'node:test';
import { baseUrl } from '../helpers/api.js';
import { healthResponseSchema, errorResponseSchema } from '../../src/modules/openapi/server.js';

test('public health requests and method errors conform to the OpenAPI response schemas', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(response.headers.get('x-request-id'));
  healthResponseSchema.parse(await response.json());

  const rejected = await fetch(`${baseUrl}/health`, { method: 'POST', body: 'invalid JSON' });
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('allow'), 'GET');
  const payload = errorResponseSchema.parse(await rejected.json());
  assert.equal(payload.error.code, 'METHOD_NOT_ALLOWED');
});

test('conditional requests preserve API success, method errors and authentication errors', async () => {
  // fetch adds Cache-Control: no-cache for validators, masking Next.js's automatic 304 behavior.
  for (const [path, method, status, code] of [
    ['/health', 'GET', 200, undefined],
    ['/health', 'POST', 405, 'METHOD_NOT_ALLOWED'],
    ['/api/admin/me', 'GET', 401, 'UNAUTHENTICATED'],
  ]) {
    const req = request(`${baseUrl}${path}`, {
      method,
      headers: { 'If-None-Match': '*' },
    });
    const pendingResponse = once(req, 'response');
    req.end();
    const [response] = await pendingResponse;
    const body = await text(response);
    assert.equal(response.statusCode, status, `${method} ${path}`);
    assert.equal(response.headers.etag, undefined);
    assert.match(response.headers['cache-control'], /no-store/);
    const payload = JSON.parse(body);
    (status === 200 ? healthResponseSchema : errorResponseSchema).parse(payload);
    assert.equal(payload.error.code, code);
  }
});
