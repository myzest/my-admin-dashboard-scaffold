import { createServer } from 'node:http';
import next from 'next';
import { getTestBuildDirectory } from './test-config.js';

getTestBuildDirectory(process.env.TEST_RUN_ID);
if (!process.send) throw new Error('测试服务必须由 scripts/test.js 启动');

const app = next({ dev: false, hostname: '127.0.0.1' });
const server = createServer(app.getRequestHandler());
let isStopping = false;

async function stop() {
  if (isStopping) return;
  isStopping = true;
  server.closeAllConnections();
  server.close();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('disconnect', stop);

await app.prepare();
server.listen(0, '127.0.0.1', () => {
  process.send({ type: 'ready', port: server.address().port });
});
