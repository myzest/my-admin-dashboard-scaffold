import Head from 'next/head';
import { site } from '@/config/site';
import { requirePageAuth } from '@/modules/auth/server';
import { ApiDocsPage } from '@/modules/openapi/client';
import { openApiDocument } from '@/modules/openapi/server';

export default function ApiDocsRoute(props) {
  return (
    <>
      <Head>
        <title>{`接口文档 · ${site.name}`}</title>
      </Head>
      <ApiDocsPage {...props} />
    </>
  );
}

export async function getServerSideProps(context) {
  const result = await requirePageAuth(context, { role: 'admin' });
  if (!result.props) return result;
  return { props: { ...result.props, apiDocument: openApiDocument } };
}
