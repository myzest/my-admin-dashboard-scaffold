import './load-env.js';
import { getDatabaseConfig, getSessionConfig } from '../src/server/config.js';

try {
  getDatabaseConfig();
  getSessionConfig();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
