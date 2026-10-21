import { getAdminProfile } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({ GET: ({ user }) => getAdminProfile(user.id) }, { role: 'admin' });
