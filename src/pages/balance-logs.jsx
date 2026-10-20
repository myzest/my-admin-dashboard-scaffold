import Head from 'next/head';
import { useRouter } from 'next/router';
import { BalanceLogsPage } from '@/modules/balance/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function BalanceLogsRoute({ user }) {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>余额日志 · 后台管理</title>
      </Head>
      <BalanceLogsPage key={String(router.query.userId || '')} user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
