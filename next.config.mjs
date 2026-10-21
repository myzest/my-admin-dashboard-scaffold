import { fileURLToPath } from 'node:url';
import { getTestBuildDirectory, restoreTestConfig } from './scripts/test-config.js';

if (process.env.TEST_RUN_ID) restoreTestConfig();

const nextConfig = {
  distDir: process.env.TEST_RUN_ID ? getTestBuildDirectory(process.env.TEST_RUN_ID) : '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@arco-design/web-react'],
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
