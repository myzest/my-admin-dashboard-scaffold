import { getDatabase } from '../../../server/database.js';
import { getSettingsRecord } from '../service.js';
import { registrationSettingsSchema } from '../schema.js';
import { createOperationLog } from '../../operation-logs/server.js';

export async function updateRegistrationSettings(values, operatorId) {
  const { allowRegistration } = registrationSettingsSchema.parse(values);
  return getDatabase().transaction(async (transaction) => {
    const settings = await getSettingsRecord({ transaction, lock: transaction.LOCK.UPDATE });
    const before = { allowRegistration: settings.allowRegistration };
    await settings.update({ allowRegistration }, { transaction });
    await createOperationLog(
      { operatorId, action: 'REGISTRATION_UPDATED', targetId: 1, before, after: settings },
      { transaction },
    );
    return { allowRegistration: settings.allowRegistration };
  });
}
