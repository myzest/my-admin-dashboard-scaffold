import pick from 'lodash/pick.js';
import { HttpError } from '../../server/errors.js';
import { getUserById } from '../users/server.js';
import { getOperationLogModel } from './model.js';
import { operationActionSchema, operationIdSchema, operationLogQuerySchema } from './schema.js';

const USER_FIELDS = ['username', 'displayName', 'isEnabled'];
const CATEGORY_FIELDS = ['name', 'description', 'isEnabled'];
const OPERATION_DEFINITIONS = {
  USER_CREATED: { targetType: 'user', fields: USER_FIELDS },
  USER_UPDATED: { targetType: 'user', fields: ['username', 'displayName'] },
  USER_ENABLED: { targetType: 'user', fields: ['isEnabled'] },
  USER_DISABLED: { targetType: 'user', fields: ['isEnabled'] },
  USER_PASSWORD_RESET: { targetType: 'user', fields: [] },
  USER_DELETED: { targetType: 'user', fields: [] },
  CATEGORY_CREATED: { targetType: 'category', fields: CATEGORY_FIELDS },
  CATEGORY_UPDATED: { targetType: 'category', fields: CATEGORY_FIELDS },
  CATEGORY_DELETED: { targetType: 'category', fields: CATEGORY_FIELDS },
  REGISTRATION_UPDATED: { targetType: 'settings', fields: ['allowRegistration'] },
};

function getPublicOperationLog(log) {
  return {
    ...pick(log, [
      'id',
      'operatorId',
      'operatorUsername',
      'action',
      'targetType',
      'targetId',
      'changes',
    ]),
    createdAt: log.createdAt.toISOString(),
  };
}

export async function createOperationLog(
  { operatorId, action, targetId, before, after },
  { transaction },
) {
  if (!transaction) throw new Error('操作日志必须与业务变更使用同一事务');
  operationActionSchema.parse(action);
  const operator = await getUserById(operationIdSchema.parse(operatorId), { transaction });
  if (operator?.role !== 'admin' || !operator.isEnabled) {
    throw new HttpError(403, 'FORBIDDEN', '只有管理员可以执行此操作');
  }
  const { targetType, fields } = OPERATION_DEFINITIONS[action];
  // User deletion removes all identifying history; the final event contains no target identity.
  const id = action === 'USER_DELETED' ? null : operationIdSchema.parse(targetId);
  const changes = {};
  for (const field of fields) {
    const previous = before?.[field] ?? null;
    const next = after?.[field] ?? null;
    if (previous !== next) changes[field] = { before: previous, after: next };
  }
  const log = await getOperationLogModel().create(
    {
      operatorId: operator.id,
      operatorUsername: operator.username,
      userId: targetType === 'user' ? id : null,
      action,
      targetType,
      targetId: id,
      changes,
    },
    { transaction },
  );
  return getPublicOperationLog(log);
}

export async function listOperationLogs(query) {
  const { page, pageSize, ...where } = operationLogQuerySchema.parse(query);
  const { rows, count } = await getOperationLogModel().findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return {
    items: rows.map(getPublicOperationLog),
    pagination: { page, pageSize, total: count },
  };
}
