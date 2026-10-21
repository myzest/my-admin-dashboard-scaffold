import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { initialAdminSchema } from '../src/modules/users/schema.js';

const testConfigSchema = z
  .object({
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+_test$/),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    ADMIN_USERNAME: initialAdminSchema.shape.username,
    ADMIN_PASSWORD: initialAdminSchema.shape.password,
  })
  .strict();

export function getTestBuildDirectory(runId) {
  if (!z.uuid().safeParse(runId).success) {
    throw new Error('测试运行标识无效，请使用 npm run test:integration / test:e2e / test:system');
  }
  return `.local/test-build-${runId}`;
}

export function createTestEnvironment(configPath, inherited = process.env) {
  let values;
  try {
    values = dotenv.parse(readFileSync(configPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('缺少 .env.test.local，请从 .env.test.example 复制并填写独立测试库配置');
  }
  const result = testConfigSchema.safeParse(values);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join('.') || '额外配置')
      .join(', ');
    throw new Error(`测试配置无效：${fields}；必须显式填写独立的 *_test 数据库和测试管理员`);
  }
  const environment = Object.fromEntries(
    Object.entries(inherited).filter(
      ([key]) => !/^(DB_|ADMIN_|SESSION_|TEST_|TRUSTED_PROXY_IPS$)/.test(key),
    ),
  );
  return {
    ...environment,
    ...Object.fromEntries(Object.entries(result.data).map(([key, value]) => [key, String(value)])),
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    TRUSTED_PROXY_IPS: '',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    TEST_RUN_ID: randomUUID(),
    TEST_CONFIG_SNAPSHOT: Buffer.from(JSON.stringify(result.data)).toString('base64'),
  };
}

export function restoreTestConfig(environment = process.env) {
  // Next expands $ in existing environment values when an env file repeats their keys.
  // Restore the runner's immutable config after Next loads those files.
  const values = testConfigSchema.parse(
    JSON.parse(Buffer.from(environment.TEST_CONFIG_SNAPSHOT, 'base64').toString('utf8')),
  );
  Object.assign(
    environment,
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
  );
}

export function getManagedTestUrl(environment = process.env) {
  getTestBuildDirectory(environment.TEST_RUN_ID);
  const url = new URL(environment.TEST_BASE_URL);
  if (
    !environment.DB_NAME?.endsWith('_test') ||
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('测试只能连接本次隔离启动的本机服务，请使用 npm run test:system');
  }
  return url.origin;
}
