import { listUsers, createUser } from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    GET: ({ req }) => listUsers(req.query),
    POST: async ({ body, res }) => {
      const user = await createUser(body);
      res.statusCode = 201;
      return user;
    },
  },
  { role: 'admin' },
);
