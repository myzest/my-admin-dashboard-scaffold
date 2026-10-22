import { z } from 'zod';
import { OPERATION_ACTION_LABELS, OPERATION_TARGET_LABELS } from './constants.js';

export const operationIdSchema = z.coerce.number().int().positive().max(2147483647);
export const operationActionSchema = z.enum(Object.keys(OPERATION_ACTION_LABELS));

export const operationLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  action: operationActionSchema.optional(),
  operatorId: operationIdSchema.optional(),
  targetType: z.enum(Object.keys(OPERATION_TARGET_LABELS)).optional(),
  targetId: operationIdSchema.optional(),
});
