import { changeAdminPassword } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  { POST: ({ req, res, body, user }) => changeAdminPassword(req, res, user.id, body) },
  { role: 'admin' },
);
