import { changeUserBalance, userIdSchema } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: ({ req, body, user }) =>
      changeUserBalance(userIdSchema.parse(req.query.id), body, user.id),
  },
  { role: 'admin' },
);
