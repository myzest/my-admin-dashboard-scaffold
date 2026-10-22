import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { ZodError } from 'zod';
import { request } from '../src/lib/request.js';
import { createFieldRules, getValidationFields } from '../src/lib/validation.js';
import { loginSchema } from '../src/modules/auth/schema.js';
import { categorySchema } from '../src/modules/categories/schema.js';
import {
  balanceChangeSchema,
  createUserSchema,
  passwordSchema,
  usernameSchema,
} from '../src/modules/users/client.js';
import { createApiHandler } from '../src/server/api-handler.js';
import { HttpError } from '../src/server/errors.js';

async function invokeApi(route, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = '/api/validation-test';
  req.headers = { 'content-type': 'application/json' };
  const res = {
    statusCode: 200,
    setHeader() {},
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await createApiHandler({ POST: route }, { authenticated: false })(req, res);
  return res;
}

test('field rules validate explicit empty, length and UTF-8 boundaries', () => {
  const cases = [
    [
      usernameSchema,
      true,
      [
        [undefined, '请输入用户名'],
        ['', '用户名至少 5 位'],
        ['user', '用户名至少 5 位'],
        ['user5', undefined],
        [' bad name ', '用户名只支持字母、数字、下划线和短横线'],
        [' valid_name ', undefined],
      ],
    ],
    [
      loginSchema.shape.username,
      true,
      [
        [undefined, '请输入账号'],
        ['', '请输入账号'],
        ['root', undefined],
      ],
    ],
    [
      passwordSchema,
      true,
      [
        [undefined, '请输入密码'],
        ['', '请输入密码'],
        ['12345', '密码至少 6 位'],
        ['123456', undefined],
        ['密'.repeat(24), undefined],
        ['密'.repeat(25), '密码不能超过 72 字节'],
      ],
    ],
    [
      categorySchema.shape.name,
      true,
      [
        [undefined, '请输入分类名称'],
        ['', '请输入分类名称'],
        ['   ', '请输入分类名称'],
        ['名称', undefined],
      ],
    ],
    [
      createUserSchema.shape.displayName,
      false,
      [
        [undefined, undefined],
        ['', undefined],
        ['显示名称', undefined],
        ['名'.repeat(65), '显示名称不能超过 64 个字符'],
      ],
    ],
    [
      balanceChangeSchema.shape.amount,
      true,
      [
        [undefined, '请输入金额'],
        ['', '金额最多支持 16 位整数和 4 位小数'],
        ['0', '金额必须大于零'],
        ['0.0001', undefined],
        ['1.23456', '金额最多支持 16 位整数和 4 位小数'],
        ['1e2', '金额最多支持 16 位整数和 4 位小数'],
      ],
    ],
  ];
  for (const [schema, required, values] of cases) {
    const rules = createFieldRules(schema);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].required, required);
    assert.equal(rules[0].ignoreEmptyString, false);
    for (const [value, expectedMessage] of values) {
      let calls = 0;
      let actualMessage;
      rules[0].validator(value, (message) => {
        calls += 1;
        actualMessage = message;
      });
      assert.equal(calls, 1);
      assert.equal(actualMessage, expectedMessage);
      assert.equal(schema.safeParse(value).success, expectedMessage === undefined);
    }
  }
});

test('shared client schemas validate without the Node.js Buffer global', () => {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import assert from 'node:assert/strict';
        globalThis.Buffer = undefined;
        const { passwordSchema, createUserSchema } = await import('./src/modules/users/client.js');
        const { loginSchema } = await import('./src/modules/auth/schema.js');
        assert.equal(passwordSchema.safeParse('密'.repeat(24)).success, true);
        assert.equal(passwordSchema.safeParse('密'.repeat(25)).success, false);
        assert.equal(createUserSchema.safeParse({ username: 'user5', password: '123456' }).success, true);
        assert.equal(loginSchema.safeParse({ username: 'root', password: '123456' }).success, true);
      `,
    ],
    { cwd: new URL('..', import.meta.url), timeout: 10000, stdio: 'pipe' },
  );
});

test('validation fields keep the first field message and reject unsafe or nested paths', () => {
  const issue = (path, message) => ({ code: 'custom', path, message });
  const error = new ZodError([
    issue(['username'], '用户名至少 5 位'),
    issue(['username'], '用户名格式不正确'),
    issue(['profile', 'username'], '嵌套字段'),
    issue([], '整体错误'),
    issue(['__proto__'], '危险字段'),
    issue(['constructor'], '危险字段'),
    issue(['prototype'], '危险字段'),
    issue(['profile.name'], '非字段路径'),
  ]);
  assert.deepEqual(getValidationFields(error), { username: '用户名至少 5 位' });
});

test('API validation returns safe field errors while preserving the error envelope', async () => {
  const response = await invokeApi(({ body }) => createUserSchema.parse(body), {
    username: 'user',
    password: '12345',
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    status: false,
    data: {},
    error: {
      code: 'VALIDATION_ERROR',
      message: '请求参数不正确，请检查输入内容',
      fields: { username: '用户名至少 5 位', password: '密码至少 6 位' },
    },
  });
  assert.equal(JSON.stringify(response.payload).includes('12345'), false);

  const unknownField = await invokeApi(({ body }) => createUserSchema.parse(body), {
    username: 'user5',
    password: '123456',
    secretInternalField: 'should-not-leak',
  });
  assert.equal(unknownField.statusCode, 400);
  assert.equal(Object.hasOwn(unknownField.payload.error, 'fields'), false);
  assert.equal(JSON.stringify(unknownField.payload).includes('secretInternalField'), false);
  assert.equal(JSON.stringify(unknownField.payload).includes('should-not-leak'), false);
});

test('business field errors survive the API and request client without replacing the message', async (context) => {
  const response = await invokeApi(() => {
    throw new HttpError(409, 'USERNAME_EXISTS', '用户名已存在', { username: '用户名已存在' });
  }, {});
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(response.payload, { status: response.statusCode }),
  );
  await assert.rejects(request('/api/validation-test', { method: 'POST' }), {
    name: 'ApiError',
    status: 409,
    code: 'USERNAME_EXISTS',
    message: '用户名已存在',
    fields: { username: '用户名已存在' },
  });
});

test('unexpected API exceptions never expose internal messages as field errors', async (context) => {
  const consoleMock = context.mock.method(console, 'error', () => {});
  const response = await invokeApi(() => {
    throw new Error('database-credential-and-query-details');
  }, {});
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.payload.error, {
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用，请稍后重试',
  });
  assert.equal(
    JSON.stringify(consoleMock.mock.calls).includes('database-credential-and-query-details'),
    false,
  );
});
