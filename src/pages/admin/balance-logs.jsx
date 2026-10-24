import Head from 'next/head';
import { site } from '@/config/site';
import { AdminBalanceLogsPage } from '@/modules/balance/admin/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function AdminBalanceLogsRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`余额日志 · ${site.name}`}</title>
      </Head>
      <AdminBalanceLogsPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
