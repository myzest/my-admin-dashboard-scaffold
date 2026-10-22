import './load-env.js';
import {
  createJobQueue,
  createJob,
  waitForJobReady,
  logJobError,
} from '../src/server/job-queue.js';
import { jobDefinitions } from '../src/jobs/registry.js';

const [command, nameOrId, json, jobId, ...extra] = process.argv.slice(2);
let queue;

class JobCommandError extends Error {}

try {
  if (
    !['list', 'run', 'status', 'retry', 'remove-schedule'].includes(command) ||
    extra.length ||
    (command === 'list' && nameOrId) ||
    (command !== 'list' && !nameOrId) ||
    (command !== 'run' && (json || jobId))
  ) {
    throw new JobCommandError(
      '用法：npm run jobs -- list | run <name> [JSON] [jobId] | status <id> | retry <id> | remove-schedule <name>',
    );
  }

  queue = createJobQueue();
  await waitForJobReady(queue);
  let result;
  if (command === 'list') {
    result = {
      definitions: Object.entries(jobDefinitions).map(([name, definition]) => ({
        name,
        schedule: definition.schedule ?? null,
      })),
      counts: await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
      schedules: await queue.getJobSchedulers(),
    };
  } else if (command === 'run') {
    let data;
    try {
      data = json ? JSON.parse(json) : {};
    } catch {
      throw new JobCommandError('任务参数必须是有效 JSON');
    }
    const job = await createJob(queue, jobDefinitions, nameOrId, data, jobId);
    result = { id: job.id, name: job.name, state: await job.getState() };
  } else if (command === 'remove-schedule') {
    result = { name: nameOrId, removed: await queue.removeJobScheduler(nameOrId) };
  } else {
    const job = await queue.getJob(nameOrId);
    if (!job) throw new JobCommandError('任务不存在或已超过保留期限');
    if (command === 'retry') {
      if ((await job.getState()) !== 'failed') throw new JobCommandError('仅可重试已失败的任务');
      await job.retry('failed', { resetAttemptsMade: true });
    }
    result = {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason || null,
      createdAt: new Date(job.timestamp).toISOString(),
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  logJobError('jobs-command-error', error);
  // Print only our command errors; driver errors can contain connection details.
  if (error instanceof JobCommandError || error.name === 'UnrecoverableError')
    console.error(error.message);
  process.exitCode = 1;
} finally {
  await queue?.close();
}
