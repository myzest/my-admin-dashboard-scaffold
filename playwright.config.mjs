import { defineConfig } from '@playwright/test';
import { getManagedTestUrl } from './scripts/test-config.js';

const baseURL = getManagedTestUrl();

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: 'list',
});
