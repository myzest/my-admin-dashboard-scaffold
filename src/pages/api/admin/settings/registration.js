import {
  getRegistrationSettings,
  updateRegistrationSettings,
} from '@/modules/settings/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    GET: () => getRegistrationSettings(),
    PUT: ({ body, user }) => updateRegistrationSettings(body, user.id),
  },
  { role: 'admin' },
);
