import { changeMyPassword } from '@/modules/users/user/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  { POST: ({ req, res, body, user }) => changeMyPassword(req, res, user.id, body) },
  { role: 'user' },
);
