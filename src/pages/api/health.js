import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler(
  {
    GET: ({ req, res }) => {
      const startupId = process.env.APP_STARTUP_ID;
      if (startupId && req.headers['x-app-startup-id'] === startupId) {
        res.setHeader('X-App-Startup-Id', startupId);
      }
      return { status: 'ok' };
    },
  },
  { authenticated: false },
);
