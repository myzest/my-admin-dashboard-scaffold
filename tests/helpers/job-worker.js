import { z } from 'zod';
import { createJobWorker } from '../../src/server/job-queue.js';

if (!process.send) throw new Error('Worker fixture requires a managed parent');
process.on('disconnect', () => process.exit(0));
process.once('message', async (options) => {
  const worker = createJobWorker(
    {
      recover: {
        schema: z.object({}).strict(),
        run: async () => {
          process.send({ type: 'active' });
          await new Promise(() => {});
        },
      },
    },
    options,
  );
  await worker.waitUntilReady();
  process.send({ type: 'ready' });
});
