import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getSessionConfig } from '../../server/config.js';
import { site } from '../../config/site.js';
import { getJobBoardError, sendJobBoardError } from './errors.js';

const BASE_PATH = '/api/admin/bull-board';

export function createJobBoardApp(queue) {
  const requests = new AsyncLocalStorage();
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BASE_PATH);
  app.disable('x-powered-by');
  serverAdapter.getRouter().disable('x-powered-by');

  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => getSessionConfig().SESSION_SECRET,
    getSessionIdentifier: (req) => req.cookies.starter_session,
    cookieName: 'XSRF-TOKEN',
    cookieOptions: { path: BASE_PATH, httpOnly: false, sameSite: 'strict', secure: false },
    // Bull Board's bundled Axios mirrors this cookie into the header on same-origin writes.
    getCsrfTokenFromRequest: (req) => req.headers['x-xsrf-token'],
  });

  app.use((req, res, next) => {
    const context = requests.getStore();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.once('finish', () => {
        console.info(
          JSON.stringify({
            event: 'job-board-operation',
            requestId: context.requestId,
            operatorId: context.user.id,
            method: req.method,
            action: context.action || 'unmatched',
            queue: context.queue,
            jobId: context.jobId,
            schedulerId: context.schedulerId,
            status: res.statusCode,
          }),
        );
      });
    }
    next();
  });
  app.use(BASE_PATH, doubleCsrfProtection);
  app.get(`${BASE_PATH}/_status`, async (req, res) => {
    await queue.getJobCounts('waiting');
    generateCsrfToken(req, res);
    res.json({ status: true, data: {}, error: {} });
  });
  // Issue the same session-bound token when the dashboard is opened directly.
  app.use(BASE_PATH, (req, res, next) => {
    if (req.method === 'GET' && !/^\/(api|static)(\/|$)/.test(req.path)) {
      generateCsrfToken(req, res);
    }
    next();
  });

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: `${site.name} · 后台任务`,
        ...(site.logo ? { boardLogo: { path: site.logo } } : {}),
        locale: { lng: 'zh-CN' },
      },
      handlerHooks: {
        before: ({ route, request }) => {
          Object.assign(requests.getStore(), {
            action: route,
            queue: request.params.queueName,
            jobId: request.params.jobId,
            schedulerId: request.params.schedulerId,
          });
        },
      },
    },
  });
  // The upstream handler includes raw error messages and development stacks.
  serverAdapter.setErrorHandler((error) => {
    const failure = getJobBoardError(error, requests.getStore().requestId);
    return {
      status: failure.status,
      body: { error: 'ERRORS.INTERNAL_SERVER_ERROR', message: failure.message },
    };
  });
  app.use(BASE_PATH, serverAdapter.getRouter());
  app.use((_req, res) => res.status(404).json({ error: 'ERRORS.QUEUE_NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    sendJobBoardError(req, res, error, requests.getStore().requestId);
  });

  return (req, res, context) => requests.run(context, () => app(req, res));
}
