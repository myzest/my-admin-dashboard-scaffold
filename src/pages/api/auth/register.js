import { register } from '@/modules/auth/server';
import { createUserSchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    POST: async ({ req, res, body }) => {
      const result = await register(req, res, createUserSchema.parse(body));
      res.statusCode = 201;
      return result;
    },
  },
  { authenticated: false },
);
