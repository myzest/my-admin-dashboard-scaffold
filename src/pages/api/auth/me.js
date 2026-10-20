import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({ GET: ({ user }) => ({ user }) }, { role: null });
