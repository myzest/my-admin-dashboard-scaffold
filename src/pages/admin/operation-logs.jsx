import Head from 'next/head';
import { site } from '@/config/site';
import { OperationLogsPage } from '@/modules/operation-logs/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function OperationLogsRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`操作日志 · ${site.name}`}</title>
      </Head>
      <OperationLogsPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
