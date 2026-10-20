import './scripts/load-env.js';
import { defineConfig } from '@playwright/test';

if (!process.env.DB_NAME?.endsWith('_test')) {
  throw new Error('浏览器测试必须使用名称以 _test 结尾的独立数据库');
}

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: 'list',
});
