import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(5, '用户名至少 5 位')
  .max(64, '用户名不能超过 64 个字符')
  .regex(/^[a-zA-Z0-9_-]+$/, '用户名只支持字母、数字、下划线和短横线');

export const passwordSchema = z
  .string()
  .min(6, '密码至少 6 位')
  .max(72, '密码不能超过 72 字节')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '密码不能超过 72 字节');

const displayNameSchema = z.string().trim().max(64, '显示名称不能超过 64 个字符').default('');
const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(10);

export const userIdSchema = z.coerce.number().int().positive().max(2147483647);

export const initialAdminSchema = z
  .object({ username: usernameSchema, password: passwordSchema })
  .strict();

export const createUserSchema = z
  .object({ username: usernameSchema, displayName: displayNameSchema, password: passwordSchema })
  .strict();

export const updateUserSchema = createUserSchema.omit({ password: true });

export const userStatusSchema = z.object({ isEnabled: z.boolean() }).strict();

export const resetPasswordSchema = z.object({ newPassword: passwordSchema }).strict();

export const userQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  search: z.string().trim().max(64).default(''),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, '请输入原密码')
      .max(72)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, '密码不能超过 72 字节'),
    newPassword: passwordSchema,
  })
  .strict();

export const balanceChangeSchema = z
  .object({
    direction: z.enum(['increase', 'decrease']),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,16}(?:\.\d{1,4})?$/, '金额最多支持 16 位整数和 4 位小数')
      .refine((value) => /[1-9]/.test(value), '金额必须大于零'),
    reason: z.string().trim().min(1, '请输入调整原因').max(500, '调整原因不能超过 500 个字符'),
    operationId: z
      .string()
      .uuid('操作编号无效')
      .transform((value) => value.toLowerCase()),
  })
  .strict();

export const balanceLogQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  userId: userIdSchema.optional(),
});
