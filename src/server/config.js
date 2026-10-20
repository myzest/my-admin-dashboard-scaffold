import { z } from 'zod';

const databaseSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

const sessionSchema = z.object({ SESSION_SECRET: z.string().min(32) });

let databaseConfig;
let sessionConfig;

function readConfig(schema) {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`环境配置无效，请检查：${fields}`);
  }
  return result.data;
}

export function getDatabaseConfig() {
  return (databaseConfig ||= readConfig(databaseSchema));
}

export function getSessionConfig() {
  return (sessionConfig ||= readConfig(sessionSchema));
}
