import nextEnv from '@next/env';
import { restoreTestConfig } from './test-config.js';

if (process.env.TEST_RUN_ID) {
  restoreTestConfig();
} else {
  // Next selects env files by command; its npm prehooks must use the same mode.
  const lifecycle = process.env.npm_lifecycle_event;
  const isDevelopment =
    lifecycle === 'predev' || (lifecycle !== 'prestart' && process.env.NODE_ENV === 'development');
  process.env.NODE_ENV ||= isDevelopment ? 'development' : 'production';
  nextEnv.loadEnvConfig(process.cwd(), isDevelopment);
}
