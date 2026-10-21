import { HttpError } from '../../../server/errors.js';
import { changePasswordAndRevokeSessions } from '../../auth/server.js';
import { getUserModel } from '../models.js';
import { getPublicUser } from '../service.js';
import { findBalanceLogs } from '../balance-logs.js';
import { userIdSchema, myBalanceLogQuerySchema } from '../schema.js';

export async function getMyProfile(userId) {
  const user = await getUserModel().findOne({
    where: { id: userIdSchema.parse(userId), role: 'user' },
    attributes: { exclude: ['passwordHash'] },
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '账号不存在');
  return { user: getPublicUser(user) };
}

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
