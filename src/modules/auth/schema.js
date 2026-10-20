import { z } from 'zod';

export const loginSchema = z
  .object({
    username: z.string().trim().min(1, '请输入用户名').max(64),
    password: z
      .string()
      .min(1, '请输入密码')
      .max(72)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '密码不能超过 72 字节'),
  })
  .strict();
