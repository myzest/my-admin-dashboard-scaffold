import { listUsers, createUser, createUserSchema, userQuerySchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  GET: ({ req }) => listUsers(userQuerySchema.parse(req.query)),
  POST: async ({ body, res }) => {
    const user = await createUser(createUserSchema.parse(body));
    res.statusCode = 201;
    return user;
  },
});
