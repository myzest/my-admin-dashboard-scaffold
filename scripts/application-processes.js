import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function signalProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    // macOS can return EPERM for a group whose exited children have not been reaped yet.
    if (!['ESRCH', 'EPERM'].includes(error.code)) throw error;
  }
}

function isProcessGroupRunning(child) {
  if (!child.pid) return false;
  if (process.platform === 'win32') return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function waitForWeb(url, startupId, signal) {
  while (!signal.aborted) {
    try {
      const response = await fetch(url, {
        headers: { 'X-App-Startup-Id': startupId },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
      });
      const body = await response.json();
      if (
        response.ok &&
        response.headers.get('x-app-startup-id') === startupId &&
        body.status === true &&
        body.data?.status === 'ok'
      ) {
        return;
      }
    } catch {
      // The listener and the health route can become available at different times.
    }
    await delay(100, undefined, { signal });
  }
  signal.throwIfAborted();
}

export async function runApplication({
  mode,
  hostname,
  port,
  startupTimeoutMs = mode === 'dev' ? 120000 : 60000,
  shutdownTimeoutMs = 31000,
}) {
  const controller = new AbortController();
  const { signal } = controller;
  const startupId = randomUUID();
  const children = [];
  const readyServices = new Set();
  let failure;

  function stop(error) {
    if (signal.aborted) return;
    failure = error;
    controller.abort();
  }

  function startService(name, file, args = []) {
    const child = fork(new URL(file, import.meta.url), args, {
      cwd: root,
      env: { ...process.env, APP_STARTUP_ID: startupId },
      execArgv: [],
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.push(child);
    console.log(JSON.stringify({ event: 'service-started', name, pid: child.pid }));
    for (const [stream, output] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      createInterface({ input: stream }).on('line', (line) => output.write(`[${name}] ${line}\n`));
    }
    child.once('error', (error) =>
      stop(new Error(`${name} 进程错误：${error.code || error.name}`)),
    );
    child.once('exit', (code, exitSignal) => {
      // Next start handles SIGTERM by exiting with 128 + 15 instead of a signal code.
      const isExpectedStop =
        code === 0 || exitSignal === 'SIGTERM' || (name === 'web' && code === 143);
      if (!signal.aborted) {
        stop(new Error(`${name} 进程意外退出：${exitSignal || code}`));
      } else if (!isExpectedStop) {
        failure ||= new Error(`${name} 进程停止失败：${exitSignal || code}`);
      }
    });
    return child;
  }

  const onStop = () => stop();
  for (const event of ['SIGINT', 'SIGTERM', 'disconnect']) process.on(event, onStop);
  const timer = setTimeout(() => {
    const pending = ['web', 'worker'].filter((name) => !readyServices.has(name)).join(', ');
    stop(new Error(`APPLICATION_START_TIMEOUT：等待 ${pending} 就绪超时`));
  }, startupTimeoutMs);

  try {
    startService('web', './web.js', [mode, '--hostname', hostname, '--port', String(port)]);
    const worker = startService('worker', './worker.js');
    const probeHostname = { '0.0.0.0': '127.0.0.1', '::': '::1' }[hostname] || hostname;
    const host = probeHostname.includes(':') ? `[${probeHostname}]` : probeHostname;
    await Promise.all([
      waitForWeb(`http://${host}:${port}/health`, startupId, signal).then(() =>
        readyServices.add('web'),
      ),
      once(worker, 'message', { signal }).then(([message]) => {
        if (message?.type !== 'ready') throw new Error('WORKER_READY_INVALID：Worker 就绪通知无效');
        readyServices.add('worker');
      }),
    ]);
    signal.throwIfAborted();
    clearTimeout(timer);
    console.log(JSON.stringify({ event: 'application-ready', mode, hostname, port }));
    if (process.connected) {
      process.send('ready', (error) => {
        if (error) stop(new Error('APPLICATION_SUPERVISOR_DISCONNECTED：就绪通知发送失败'));
      });
    }
    if (!signal.aborted) await once(signal, 'abort');
  } catch (error) {
    stop(error);
  } finally {
    clearTimeout(timer);
    stop();
    // Keep the original group IDs even if a CLI has already exited: its children may remain.
    for (const child of children) signalProcessGroup(child, 'SIGTERM');
    const deadline = Date.now() + shutdownTimeoutMs;
    while (children.some(isProcessGroupRunning) && Date.now() < deadline) await delay(50);
    if (children.some(isProcessGroupRunning)) {
      for (const child of children) signalProcessGroup(child, 'SIGKILL');
      const timeoutMessage = 'APPLICATION_STOP_TIMEOUT：退出超时，已强制停止子进程';
      failure = new Error([failure?.message, timeoutMessage].filter(Boolean).join('；'));
    }
    for (const event of ['SIGINT', 'SIGTERM', 'disconnect']) process.off(event, onStop);
  }
  if (failure) throw failure;
}
