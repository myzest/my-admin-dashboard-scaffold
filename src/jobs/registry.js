import { z } from 'zod';
import { deleteExpiredSessions } from '../modules/auth/server.js';

export const jobDefinitions = {
  'cleanup-expired-sessions': {
    schema: z.object({}).strict(),
    schedule: { pattern: '0 * * * *', tz: 'Asia/Shanghai' },
    run: () => deleteExpiredSessions(),
  },
};
