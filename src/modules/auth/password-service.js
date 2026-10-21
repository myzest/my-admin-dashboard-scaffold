import { Transaction } from 'sequelize';
import { getDatabase } from '../../server/database.js';
import { changeAccountPassword, resetAccountPassword } from '../users/server.js';
import { getSession, revokeUserSessions } from './session.js';

export async function changePasswordAndRevokeSessions(req, res, account, values) {
  await getDatabase().transaction(async (transaction) => {
    const user = await changeAccountPassword(account, values, { transaction });
    await revokeUserSessions(user.id, { transaction });
  });
  const session = await getSession(req, res);
  session.destroy();
  return {};
}

export async function resetPasswordAndRevokeSessions(account, values) {
  await getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const user = await resetAccountPassword(account, values, { transaction });
      await revokeUserSessions(user.id, { transaction });
    },
  );
  return {};
}
