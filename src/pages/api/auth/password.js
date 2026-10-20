import { changePassword } from '@/modules/auth/server';
import { changePasswordSchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: ({ req, res, body, user }) =>
      changePassword(req, res, user.id, changePasswordSchema.parse(body)),
  },
  { role: null },
);
