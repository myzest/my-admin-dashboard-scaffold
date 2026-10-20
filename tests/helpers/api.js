import assert from 'node:assert/strict';

export const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

export async function call(
  path,
  { method = 'GET', body, cookie, origin, raw, contentType = 'application/json' } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(method === 'GET' ? {} : { 'Content-Type': contentType }),
    },
    ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body ?? {}) }),
  });
  const payload = await response.json();
  assert.equal(payload.status, response.ok);
  assert.ok(payload.data !== undefined);
  assert.ok(payload.error !== undefined);
  assert.deepEqual(response.ok ? payload.error : payload.data, {});
  return { response, payload, data: payload.data };
}
