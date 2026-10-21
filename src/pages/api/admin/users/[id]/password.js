import { resetUserPassword } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: ({ req, body }) => resetUserPassword(req.query.id, body),
  },
  { role: 'admin' },
);
