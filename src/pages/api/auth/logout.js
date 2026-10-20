import { logout } from '@/modules/auth/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: ({ req, res }) => logout(req, res),
  },
  { authenticated: false },
);
