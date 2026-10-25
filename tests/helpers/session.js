import { randomUUID } from 'node:crypto';
import { sealData } from 'iron-session';
import { getSessionModel } from '../../src/modules/auth/models.js';

// Fixture cookies exercise authorization without consuming the login quota.
export async function createSessionCookie(userId) {
  const id = randomUUID();
  await getSessionModel().create({ id, userId, expiresAt: new Date(Date.now() + 3600000) });
  const sealed = await sealData(
    { sessionId: id },
    { password: process.env.SESSION_SECRET, ttl: 3600 },
  );
  return `starter_session=${sealed}`;
}
