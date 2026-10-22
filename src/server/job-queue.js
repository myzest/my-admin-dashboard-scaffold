import {
  Queue,
  Worker,
  UnrecoverableError,
  DelayedError,
  WaitingError,
  WaitingChildrenError,
  RateLimitError,
} from 'bullmq';
import { getJobConfig } from './config.js';

const QUEUE_NAME = 'background';
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 5000 },
};

function getQueueOptions() {
  const config = getJobConfig();
  return {
    connection: { url: config.REDIS_URL, connectTimeout: 5000 },
    prefix: config.JOB_QUEUE_PREFIX,
    concurrency: config.JOB_WORKER_CONCURRENCY,
  };
}

export function logJobError(event, error, fields = {}) {
  console.error(
    JSON.stringify({
      event,
      ...fields,
      error: error.name,
      code: error.original?.code || error.code,
    }),
  );
}

export function createJobQueue(options = getQueueOptions()) {
  const queue = new Queue(QUEUE_NAME, {
    prefix: options.prefix,
    connection: {
      ...options.connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queue.on('error', (error) => logJobError('queue-error', error));
  return queue;
}

export async function waitForJobReady(queue, timeoutMs = 10000) {
  let timer;
  try {
    await Promise.race([
      queue.waitUntilReady(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error('JOB_QUEUE_UNAVAILABLE'), { code: 'JOB_QUEUE_UNAVAILABLE' }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function getDefinition(definitions, name) {
  if (!Object.hasOwn(definitions, name)) throw new UnrecoverableError('UNKNOWN_JOB');
  return definitions[name];
}

function parseJobData(definition, data) {
  const result = definition.schema.safeParse(data);
  if (!result.success) throw new UnrecoverableError('INVALID_JOB_DATA');
  return result.data;
}

export function createJobWorker(definitions, options = getQueueOptions()) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const definition = getDefinition(definitions, job.name);
      const data = parseJobData(definition, job.data);
      try {
        return await definition.run(data, job);
      } catch (error) {
        // These exceptions move jobs between states without recording a failed attempt.
        for (const ControlError of [
          DelayedError,
          WaitingError,
          WaitingChildrenError,
          RateLimitError,
        ]) {
          if (error instanceof ControlError) throw new ControlError();
        }
        logJobError('job-execution-error', error, { jobId: job.id, name: job.name });
        // BullMQ stores error messages and stacks in Redis; do not persist SQL or input values.
        if (error instanceof UnrecoverableError) throw new UnrecoverableError('JOB_REJECTED');
        throw new Error('JOB_EXECUTION_FAILED');
      }
    },
    {
      ...options,
      connection: { ...options.connection, maxRetriesPerRequest: null },
      concurrency: options.concurrency ?? 1,
    },
  );
  worker.on('error', (error) => logJobError('worker-error', error));
  worker.on('completed', (job) =>
    console.log(
      JSON.stringify({
        event: 'job-completed',
        jobId: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        durationMs: job.finishedOn - job.processedOn,
      }),
    ),
  );
  worker.on('failed', (job, error) =>
    logJobError('job-failed', error, {
      jobId: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
    }),
  );
  return worker;
}

export async function updateJobSchedules(queue, definitions) {
  for (const [name, definition] of Object.entries(definitions)) {
    if (definition.schedule) {
      await queue.upsertJobScheduler(name, definition.schedule, {
        name,
        data: parseJobData(definition, definition.data ?? {}),
      });
    }
  }
}

export function createJob(queue, definitions, name, data = {}, jobId) {
  const definition = getDefinition(definitions, name);
  return queue.add(name, parseJobData(definition, data), jobId ? { jobId } : {});
}
