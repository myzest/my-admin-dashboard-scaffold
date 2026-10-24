import '../../scripts/load-env.js';
import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { sealData } from 'iron-session';
import { getDatabase } from '../../src/server/database.js';
import { getSessionModel } from '../../src/modules/auth/models.js';
import { getUserModel } from '../../src/modules/users/models.js';

export { expect };

// Layout/documentation checks need authentication without using the login suite's IP quota.
export const test = base.extend({
  adminCookie: [
    async ({}, runTests) => {
      const admin = await getUserModel().findOne({
        where: { username: process.env.ADMIN_USERNAME, role: 'admin' },
      });
      const session = await getSessionModel().create({
        id: randomUUID(),
        userId: admin.id,
        expiresAt: new Date(Date.now() + 3600000),
      });
      try {
        const cookie = await sealData(
          { sessionId: session.id },
          { password: process.env.SESSION_SECRET, ttl: 3600 },
        );
        await runTests(cookie);
      } finally {
        await session.destroy();
        await getDatabase().close();
      }
    },
    { scope: 'worker' },
  ],
});
