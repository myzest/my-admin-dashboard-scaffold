import { randomUUID } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { Op, Transaction } from 'sequelize';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { getSessionConfig } from '../../server/config.js';
import { getDatabase } from '../../server/database.js';
import { HttpError } from '../../server/errors.js';
import { getHomePath } from '../../config/access.js';
import {
  authenticateUser,
  changeUserPassword,
  createUser,
  getUserById,
  resetAccountPassword,
  updateUserStatus as updateUserStatusRecord,
} from '../users/server.js';
import { getRegistrationSettings } from '../settings/server.js';
import { getSessionModel } from './models.js';
import { loginSchema } from './schema.js';

const SESSION_TTL = 12 * 60 * 60;
const loginLimiter = (globalThis.adminStarterLoginLimiter ||= new RateLimiterMemory({
  points: 10,
  duration: 15 * 60,
}));
const registrationLimiter = (globalThis.adminStarterRegistrationLimiter ||= new RateLimiterMemory({
  points: 10,
  duration: 15 * 60,
}));

function getSession(req, res) {
  const config = getSessionConfig();
  return getIronSession(req, res, {
    password: config.SESSION_SECRET,
    cookieName: 'starter_session',
    ttl: SESSION_TTL,
    cookieOptions: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    },
  });
}

async function checkAuthRate(limiter, req, res, code, message) {
  // Do not trust arbitrary X-Forwarded-For headers. This limiter is process-local.
  const clientAddress = req.socket.remoteAddress || 'unknown';
  try {
    await limiter.consume(clientAddress);
  } catch (limit) {
    res.setHeader('Retry-After', Math.ceil(limit.msBeforeNext / 1000));
    throw new HttpError(429, code, message);
  }
}

export async function login(req, res, credentials) {
  await checkAuthRate(loginLimiter, req, res, 'LOGIN_RATE_LIMITED', '登录尝试过于频繁，请稍后重试');
  await getSessionModel().destroy({ where: { expiresAt: { [Op.lte]: new Date() } } });
  const session = await getSession(req, res);
  const sessionId = randomUUID();
  // Revoked session IDs may be missing; READ COMMITTED avoids locking their key gaps.
  const user = await getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const authenticatedUser = await authenticateUser(credentials, { transaction });
      if (session.sessionId) {
        await getSessionModel().destroy({ where: { id: session.sessionId }, transaction });
      }
      await getSessionModel().create(
        {
          id: sessionId,
          userId: authenticatedUser.id,
          expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
        },
        { transaction },
      );
      return authenticatedUser;
    },
  );
  session.sessionId = sessionId;
  await session.save();
  return { user };
}

export async function register(req, res, values) {
  await checkAuthRate(
    registrationLimiter,
    req,
    res,
    'REGISTRATION_RATE_LIMITED',
    '注册尝试过于频繁，请稍后重试',
  );
  const user = await getDatabase().transaction(async (transaction) => {
    const settings = await getRegistrationSettings({ transaction, lock: transaction.LOCK.SHARE });
    if (!settings.allowRegistration) {
      throw new HttpError(403, 'REGISTRATION_CLOSED', '管理员尚未开放注册');
    }
    return createUser(values, { transaction });
  });
  return { user };
}

export async function getCurrentUser(req, res) {
  const session = await getSession(req, res);
  if (typeof session.sessionId !== 'string') return null;
  const storedSession = await getSessionModel().findOne({
    where: { id: session.sessionId, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!storedSession) return null;
  const user = await getUserById(storedSession.userId);
  return user?.isEnabled ? user : null;
}

export async function requireUser(req, res, role = null) {
  const user = await getCurrentUser(req, res);
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', '登录已失效，请重新登录');
  if (role && user.role !== role) throw new HttpError(403, 'FORBIDDEN', '没有此操作权限');
  return user;
}

export async function requirePageAuth({ req, res }, { role = null } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await getCurrentUser(req, res);
  if (!user) return { redirect: { destination: '/login', permanent: false } };
  if (role && user.role !== role) {
    return { redirect: { destination: getHomePath(user), permanent: false } };
  }
  return { props: { user } };
}

export async function changePassword(req, res, userId, values) {
  await getDatabase().transaction(async (transaction) => {
    await changeUserPassword(userId, values, { transaction });
    await getSessionModel().destroy({ where: { userId }, transaction });
  });
  const session = await getSession(req, res);
  session.destroy();
  return {};
}

export async function updateUserStatus(userId, values) {
  return getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const user = await updateUserStatusRecord(userId, values, { transaction });
      if (!user.isEnabled) {
        await getSessionModel().destroy({ where: { userId: user.id }, transaction });
      }
      return user;
    },
  );
}

async function resetPassword(account, values) {
  await getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const user = await resetAccountPassword(account, values, { transaction });
      await getSessionModel().destroy({ where: { userId: user.id }, transaction });
    },
  );
  return {};
}

export function resetUserPassword(userId, values) {
  return resetPassword({ id: userId, role: 'user' }, values);
}

export function resetAdminPassword(username, values) {
  return resetPassword(
    { username: loginSchema.shape.username.parse(username), role: 'admin' },
    values,
  );
}

export async function logout(req, res) {
  const session = await getSession(req, res);
  if (session.sessionId) {
    await getSessionModel().destroy({ where: { id: session.sessionId } });
  }
  session.destroy();
  return {};
}
