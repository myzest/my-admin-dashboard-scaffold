import Head from 'next/head';
import { site } from '@/config/site';
import { useRouter } from 'next/router';
import { AdminBalanceLogsPage } from '@/modules/balance/admin/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function AdminBalanceLogsRoute({ user }) {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>{`余额日志 · ${site.name}`}</title>
      </Head>
      <AdminBalanceLogsPage key={String(router.query.userId || '')} user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
