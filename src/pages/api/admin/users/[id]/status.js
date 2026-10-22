import { updateUserStatus } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    PUT: ({ req, body, user }) => updateUserStatus(req.query.id, body, user.id),
  },
  { role: 'admin' },
);
