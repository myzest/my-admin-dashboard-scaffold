import bcrypt from 'bcryptjs';
import pick from 'lodash/pick.js';
import { Op, UniqueConstraintError } from 'sequelize';
import { getDatabase } from '../../server/database.js';
import { HttpError } from '../../server/errors.js';
import { getUserModel } from './models.js';
import { formatMoney } from './money.js';
import {
  changePasswordSchema,
  createUserSchema,
  initialAdminSchema,
  updateUserSchema,
  userQuerySchema,
} from './schema.js';

// Unknown usernames perform the same password work as existing accounts.
const DUMMY_PASSWORD_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

function getPublicUser(user) {
  return {
    ...pick(user, ['id', 'username', 'displayName', 'role']),
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
  return getPublicUser(user);
}

export async function changeUserPassword(id, values, { transaction } = {}) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(values);
  const user = await getUserModel().findByPk(id, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', '原密码不正确');
  }
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) }, { transaction });
  return {};
}

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

export async function createUser(values, { transaction } = {}) {
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
