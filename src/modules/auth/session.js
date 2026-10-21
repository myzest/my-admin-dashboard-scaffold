import { getIronSession } from 'iron-session';
import { getSessionConfig } from '../../server/config.js';
import { getSessionModel } from './models.js';

export const SESSION_TTL = 12 * 60 * 60;

export function getSession(req, res) {
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

export function revokeUserSessions(userId, { transaction } = {}) {
  return getSessionModel().destroy({ where: { userId }, transaction });
}
