import {
  getUserById,
  updateUser,
  deleteUser,
  updateUserSchema,
  userIdSchema,
} from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';
import { HttpError } from '@/server/errors';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  GET: async ({ req }) => {
    const user = await getUserById(userIdSchema.parse(req.query.id));
    if (!user || user.role !== 'user') {
      throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
    }
    return user;
  },
  PUT: ({ req, body }) =>
    updateUser(userIdSchema.parse(req.query.id), updateUserSchema.parse(body)),
  DELETE: ({ req }) => deleteUser(userIdSchema.parse(req.query.id)),
});
