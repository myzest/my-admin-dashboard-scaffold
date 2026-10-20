import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.agents/**',
    '.claude/**',
    '.local/**',
    'test-results/**',
    'playwright-report/**',
  ]),
]);
