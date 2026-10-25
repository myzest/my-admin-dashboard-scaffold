import { fileURLToPath } from 'node:url';
import { getTestBuildDirectory, restoreTestConfig } from './scripts/test-config.js';

if (process.env.TEST_RUN_ID) restoreTestConfig();

const nextConfig = {
  distDir: process.env.TEST_RUN_ID ? getTestBuildDirectory(process.env.TEST_RUN_ID) : '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@arco-design/web-react'],
  serverExternalPackages: ['@bull-board/api', '@bull-board/ui', '@bull-board/express', 'bullmq'],
  outputFileTracingIncludes: {
    '/api/admin/bull-board/*': [
      './node_modules/@bull-board/ui/package.json',
      './node_modules/@bull-board/ui/dist/**/*',
    ],
  },
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  async rewrites() {
    return [{ source: '/health', destination: '/api/health' }];
  },
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
      {
        source: '/api/admin/bull-board/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
