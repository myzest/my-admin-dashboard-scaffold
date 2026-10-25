import { randomUUID } from 'node:crypto';
import { requireUser } from '../auth/server.js';
import { createJobQueue, waitForJobReady, logJobError } from '../../server/job-queue.js';
import { createJobBoardApp } from './board-app.js';
import { sendJobBoardError } from './errors.js';

// Retain only the connection across Next.js hot reloads; rebuild the route handlers normally.
const state = (globalThis.adminStarterJobBoardQueue ||= {
  queue: null,
  ready: null,
  isStopping: false,
  hasShutdownHandlers: false,
});
let boardApp;

async function getJobBoardQueue() {
  if (state.isStopping) throw new Error('JOB_BOARD_STOPPING');
  if (!state.ready) {
    const queue = createJobQueue();
    state.queue = queue;
    state.ready = waitForJobReady(queue)
      .then(() => queue)
      .catch(async (error) => {
        try {
          await queue.close();
        } finally {
          state.queue = null;
          state.ready = null;
        }
        throw error;
      });
  }
  return state.ready;
}

if (!state.hasShutdownHandlers) {
  state.hasShutdownHandlers = true;
  const stop = () => {
    state.isStopping = true;
    void state.queue?.close().catch((error) => logJobError('job-board-shutdown-error', error));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

export async function serveJobBoard(req, res) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'private, no-store');
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  try {
    const user = await requireUser(req, res, 'admin');
    const queue = await getJobBoardQueue();
    boardApp ||= createJobBoardApp(queue);
    // Express changes the response prototype, but Next's own response helpers would shadow it.
    delete res.status;
    delete res.json;
    delete res.send;
    boardApp(req, res, { user, requestId });
  } catch (error) {
    sendJobBoardError(req, res, error, requestId);
  }
}
