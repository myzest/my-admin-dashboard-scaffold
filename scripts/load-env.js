import nextEnv from '@next/env';
import { restoreTestConfig } from './test-config.js';

if (process.env.TEST_RUN_ID) {
  restoreTestConfig();
} else {
  process.env.NODE_ENV ||= 'production';
  nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV === 'development');
}
