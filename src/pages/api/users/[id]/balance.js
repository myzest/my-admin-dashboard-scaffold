import { changeUserBalance, balanceChangeSchema, userIdSchema } from '@/modules/users/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  POST: ({ req, body, user }) =>
    changeUserBalance(userIdSchema.parse(req.query.id), balanceChangeSchema.parse(body), user.id),
});
