import { z } from 'zod';

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, '请输入分类名称').max(64, '分类名称不能超过 64 个字符'),
    description: z.string().trim().max(500, '说明不能超过 500 个字符').default(''),
    isEnabled: z.boolean().default(true),
  })
  .strict();

export const categoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(64).default(''),
});

export const categoryIdSchema = z.coerce.number().int().positive().max(2147483647);
