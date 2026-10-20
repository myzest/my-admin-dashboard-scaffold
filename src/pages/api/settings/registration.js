import {
  getRegistrationSettings,
  updateRegistrationSettings,
  registrationSettingsSchema,
} from '@/modules/settings/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  GET: () => getRegistrationSettings(),
  PUT: ({ body }) => updateRegistrationSettings(registrationSettingsSchema.parse(body)),
});
