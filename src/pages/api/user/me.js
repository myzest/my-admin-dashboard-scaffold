import { getMyProfile } from '@/modules/users/user/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({ GET: ({ user }) => getMyProfile(user.id) }, { role: 'user' });
