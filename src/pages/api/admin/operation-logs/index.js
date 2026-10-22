import { listOperationLogs } from '@/modules/operation-logs/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  { GET: ({ req }) => listOperationLogs(req.query) },
  { role: 'admin' },
);
