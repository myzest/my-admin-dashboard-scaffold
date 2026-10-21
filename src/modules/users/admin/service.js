import bcrypt from 'bcryptjs';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { getDatabase } from '../../../server/database.js';
import { HttpError } from '../../../server/errors.js';
import {
  changePasswordAndRevokeSessions,
  resetPasswordAndRevokeSessions,
  revokeUserSessions,
  loginSchema,
} from '../../auth/server.js';
import { getUserModel } from '../models.js';
import { getPublicUser } from '../service.js';
import {
  initialAdminSchema,
  updateUserSchema,
  userQuerySchema,
  userStatusSchema,
  userIdSchema,
} from '../schema.js';

export async function seedAdmin() {
  const User = getUserModel();
  if (await User.count({ where: { role: 'admin' } })) return { created: false };
  const { username, password } = initialAdminSchema.parse({
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
  await User.create({
    username,
    displayName: username,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
    balance: '0.0000',
  });
  return { created: true };
}

export async function listUsers(query) {
  const { page, pageSize, search } = userQuerySchema.parse(query);
  const pattern = search.replace(/[\\%_]/g, '\\$&');
  const { rows, count } = await getUserModel().findAndCountAll({
    attributes: { exclude: ['passwordHash'] },
    where: {
      role: 'user',
      ...(search && {
        [Op.or]: [
          { username: { [Op.like]: `%${pattern}%` } },
          { displayName: { [Op.like]: `%${pattern}%` } },
        ],
      }),
    },
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { items: rows.map(getPublicUser), pagination: { page, pageSize, total: count } };
}

export async function updateUser(id, values) {
  const { username, displayName } = updateUserSchema.parse(values);
  try {
    return await getDatabase().transaction(async (transaction) => {
      const user = await getUserModel().findOne({
        where: { id, role: 'user' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
      await user.update({ username, displayName: displayName || username }, { transaction });
      return getPublicUser(user);
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new HttpError(409, 'USERNAME_EXISTS', '用户名已存在');
    }
    throw error;
  }
}

export async function deleteUser(id) {
  return getDatabase().transaction(async (transaction) => {
    const user = await getUserModel().findOne({
      where: { id, role: 'user' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
    // Foreign keys also remove this user's sessions and balance logs, including a nonzero balance.
    await user.destroy({ transaction });
    return {};
  });
}

export async function updateUserStatus(userId, values) {
  const id = userIdSchema.parse(userId);
  const { isEnabled } = userStatusSchema.parse(values);
  return getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const user = await getUserModel().findOne({
        where: { id, role: 'user' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
      await user.update({ isEnabled }, { transaction });
      if (!isEnabled) await revokeUserSessions(user.id, { transaction });
      return getPublicUser(user);
    },
  );
}

export function resetUserPassword(userId, values) {
  return resetPasswordAndRevokeSessions({ id: userIdSchema.parse(userId), role: 'user' }, values);
}

export function resetAdminPassword(username, values) {
  return resetPasswordAndRevokeSessions(
    { username: loginSchema.shape.username.parse(username), role: 'admin' },
    values,
  );
}

export async function getManagedUserById(userId) {
  const user = await getUserModel().findOne({
    where: { id: userIdSchema.parse(userId), role: 'user' },
    attributes: { exclude: ['passwordHash'] },
  });
  return user ? getPublicUser(user) : null;
}

export async function getAdminProfile(userId) {
  const user = await getUserModel().findOne({
    where: { id: userIdSchema.parse(userId), role: 'admin' },
    attributes: { exclude: ['passwordHash'] },
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '账号不存在');
  return { user: getPublicUser(user) };
}

export function changeAdminPassword(req, res, userId, values) {
  return changePasswordAndRevokeSessions(
    req,
    res,
    { id: userIdSchema.parse(userId), role: 'admin' },
    values,
  );
}
