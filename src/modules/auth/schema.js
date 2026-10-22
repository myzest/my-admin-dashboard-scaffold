import { z } from 'zod';
import { currentPasswordSchema } from '../users/client.js';

export const loginSchema = z
  .object({
    username: z
      .string({ error: '请输入账号' })
      .trim()
      .min(1, '请输入账号')
      .max(64, '用户名不能超过 64 个字符'),
    password: currentPasswordSchema,
  })
  .strict();
