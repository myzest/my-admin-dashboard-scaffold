import bcrypt from 'bcryptjs';
import pick from 'lodash/pick.js';
import { UniqueConstraintError } from 'sequelize';
import { HttpError } from '../../server/errors.js';
import { getUserModel } from './models.js';
import { formatMoney } from './money.js';
import { changePasswordSchema, createUserSchema, resetPasswordSchema } from './schema.js';

// Unknown usernames perform the same password work as existing accounts.
const DUMMY_PASSWORD_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

export function getPublicUser(user) {
  return {
    ...pick(user, ['id', 'username', 'displayName', 'role', 'isEnabled']),
    balance: formatMoney(user.balance),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getUserById(id, { transaction } = {}) {
  const user = await getUserModel().findByPk(id, {
    attributes: { exclude: ['passwordHash'] },
    transaction,
  });
  return user ? getPublicUser(user) : null;
}

export async function authenticateUser({ username, password }, { transaction } = {}) {
  const user = await getUserModel().findOne({
    where: { username },
    transaction,
    lock: transaction?.LOCK.UPDATE,
  });
  const isValidPassword = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user || !isValidPassword) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }
  if (!user.isEnabled) {
    throw new HttpError(403, 'ACCOUNT_DISABLED', '账号已停用，请联系管理员');
  }
  return getPublicUser(user);
}

export async function changeAccountPassword(account, values, { transaction } = {}) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(values);
  const user = await getUserModel().findOne({
    where: account,
    transaction,
    lock: transaction?.LOCK.UPDATE,
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', '原密码不正确');
  }
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) }, { transaction });
  return getPublicUser(user);
}

export async function resetAccountPassword(account, values, { transaction } = {}) {
  const { newPassword } = resetPasswordSchema.parse(values);
  const user = await getUserModel().findOne({
    where: account,
    transaction,
    lock: transaction?.LOCK.UPDATE,
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) }, { transaction });
  return getPublicUser(user);
}

export async function createUserAccount(values, { transaction } = {}) {
  const { username, displayName, password } = createUserSchema.parse(values);
  try {
    const user = await getUserModel().create(
      {
        username,
        displayName: displayName || username,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'user',
        balance: '0.0000',
      },
      { transaction },
    );
    return getPublicUser(user);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new HttpError(409, 'USERNAME_EXISTS', '用户名已存在');
    }
    throw error;
  }
}
