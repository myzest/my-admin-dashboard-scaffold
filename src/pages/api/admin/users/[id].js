import {
  getManagedUserById,
  updateUser,
  deleteUser,
  updateUserSchema,
  userIdSchema,
} from '@/modules/users/admin/server';
import { createApiHandler } from '@/server/api-handler';
import { HttpError } from '@/server/errors';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    GET: async ({ req }) => {
      const user = await getManagedUserById(userIdSchema.parse(req.query.id));
      if (!user) {
        throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
      }
      return user;
    },
    PUT: ({ req, body }) =>
      updateUser(userIdSchema.parse(req.query.id), updateUserSchema.parse(body)),
    DELETE: ({ req }) => deleteUser(userIdSchema.parse(req.query.id)),
  },
  { role: 'admin' },
);
