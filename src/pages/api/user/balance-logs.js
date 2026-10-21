import { listMyBalanceLogs } from '@/modules/users/user/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  { GET: ({ req, user }) => listMyBalanceLogs(user.id, req.query) },
  { role: 'user' },
);
