import { changePasswordAndRevokeSessions } from '../../auth/server.js';
import { findBalanceLogs } from '../balance-logs.js';
import { userIdSchema, myBalanceLogQuerySchema } from '../schema.js';

export function changeMyPassword(req, res, userId, values) {
  return changePasswordAndRevokeSessions(
    req,
    res,
    { id: userIdSchema.parse(userId), role: 'user' },
    values,
  );
}

export function listMyBalanceLogs(sessionUserId, query) {
  const userId = userIdSchema.parse(sessionUserId);
  const { page, pageSize } = myBalanceLogQuerySchema.parse(query);
  return findBalanceLogs({ where: { userId }, page, pageSize });
}
