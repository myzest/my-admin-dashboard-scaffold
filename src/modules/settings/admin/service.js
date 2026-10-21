import { getDatabase } from '../../../server/database.js';
import { getSettingsRecord } from '../service.js';
import { registrationSettingsSchema } from '../schema.js';

export async function updateRegistrationSettings(values) {
  const { allowRegistration } = registrationSettingsSchema.parse(values);
  return getDatabase().transaction(async (transaction) => {
    const settings = await getSettingsRecord({ transaction, lock: transaction.LOCK.UPDATE });
    await settings.update({ allowRegistration }, { transaction });
    return { allowRegistration: settings.allowRegistration };
  });
}
