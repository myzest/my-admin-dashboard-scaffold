import './load-env.js';
import { getDatabaseConfig, getProxyConfig, getSessionConfig } from '../src/server/config.js';

try {
  getDatabaseConfig();
  getSessionConfig();
  getProxyConfig();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
