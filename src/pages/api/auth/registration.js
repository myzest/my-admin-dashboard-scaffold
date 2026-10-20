import { getRegistrationSettings } from '@/modules/settings/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({ GET: () => getRegistrationSettings() }, { authenticated: false });
