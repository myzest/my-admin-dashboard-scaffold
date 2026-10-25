import { fileURLToPath } from 'node:url';

// The Next CLI may have its own children in development. Stop the whole group
// when the supervisor disappears, including when it is killed without a signal handler.
process.once('disconnect', () => {
  const target = process.platform === 'win32' ? process.pid : -process.pid;
  setTimeout(() => process.kill(target, 'SIGKILL'), 31000).unref();
  process.kill(target, 'SIGTERM');
});

const nextCli = import.meta.resolve('next/dist/bin/next');
process.argv[1] = fileURLToPath(nextCli);
await import(nextCli);
