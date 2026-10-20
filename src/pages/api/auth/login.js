import { login, loginSchema } from '@/modules/auth/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: ({ req, res, body }) => login(req, res, loginSchema.parse(body)),
  },
  { authenticated: false },
);
