import { resetUserPassword } from '@/modules/auth/server';
import { userIdSchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  POST: ({ req, body }) => resetUserPassword(userIdSchema.parse(req.query.id), body),
});
