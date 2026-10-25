import './load-env.js';
import { getDatabase } from '../src/server/database.js';
import {
  createJobQueue,
  createJobWorker,
  waitForJobReady,
  updateJobSchedules,
  logJobError,
} from '../src/server/job-queue.js';
import { jobDefinitions } from '../src/jobs/registry.js';

let database;
let queue;
let worker;
let isStopping = false;

async function stop(exitCode = 0) {
  if (isStopping) return;
  isStopping = true;
  // A forced exit leaves the job lock to expire; BullMQ can recover it on another worker.
  const timer = setTimeout(() => process.exit(1), 30000);
  try {
    await worker?.close();
    await queue?.close();
    await database?.close();
  } catch (error) {
    logJobError('worker-shutdown-error', error);
    exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('disconnect', () => void stop());

async function start() {
  database = getDatabase();
  await database.authenticate();
  if (isStopping) return;
  queue = createJobQueue();
  await waitForJobReady(queue);
  if (isStopping) return;
  await updateJobSchedules(queue, jobDefinitions);
  if (isStopping) return;
  worker = createJobWorker(jobDefinitions);
  await waitForJobReady(worker);
  if (isStopping) return;
  console.log(
    JSON.stringify({ event: 'worker-ready', queue: queue.name, prefix: queue.opts.prefix }),
  );
  if (process.connected) {
    process.send({ type: 'ready' }, (error) => {
      if (error) void stop(1);
    });
  }
}

try {
  await start();
} catch (error) {
  if (!isStopping) {
    logJobError('worker-startup-error', error);
    await stop(1);
  }
}
