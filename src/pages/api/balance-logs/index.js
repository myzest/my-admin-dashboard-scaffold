import { listBalanceLogs, balanceLogQuerySchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';
import { HttpError } from '@/server/errors';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    GET: ({ req, user }) => {
      const query = balanceLogQuerySchema.parse(req.query);
      if (user.role === 'user') {
        if (query.userId !== undefined && query.userId !== user.id) {
          throw new HttpError(403, 'FORBIDDEN', '没有此操作权限');
        }
        query.userId = user.id;
      }
      return listBalanceLogs(query);
    },
  },
  { role: null },
);
