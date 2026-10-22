import dynamic from 'next/dynamic';
import { Button, Spin } from '@arco-design/web-react';
import { AdminLayout } from '@/modules/auth/admin/client';
import PageHeader from '@/components/PageHeader';
import styles from './ApiDocsPage.module.css';
import '@scalar/api-reference-react/style.css';

const ApiReference = dynamic(
  () => import('@scalar/api-reference-react').then((module) => module.ApiReferenceReact),
  { ssr: false, loading: () => <Spin tip="正在加载接口文档…" /> },
);

export default function ApiDocsPage({ user, apiDocument }) {
  return (
    <AdminLayout user={user}>
      <PageHeader title="接口文档" description="查看 /health 示例的请求约定、响应结构与调用方式。">
        <Button
          href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(apiDocument, null, 2))}`}
          download="openapi.json"
        >
          下载 OpenAPI JSON
        </Button>
      </PageHeader>
      <section className={styles.reference} aria-label="OpenAPI 接口文档">
        <ApiReference
          configuration={{
            content: apiDocument,
            layout: 'classic',
            theme: 'none',
            darkMode: false,
            hideDarkModeToggle: true,
            withDefaultFonts: false,
            hideClientButton: true,
            documentDownloadType: 'none',
            showDeveloperTools: 'never',
            agent: { disabled: true },
            telemetry: false,
            proxyUrl: '',
          }}
        />
      </section>
    </AdminLayout>
  );
}
