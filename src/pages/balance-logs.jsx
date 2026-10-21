import Head from 'next/head';
import { site } from '@/config/site';
import { useRouter } from 'next/router';
import { BalanceLogsPage } from '@/modules/balance/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function BalanceLogsRoute({ user }) {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>{`余额日志 · ${site.name}`}</title>
      </Head>
      <BalanceLogsPage key={String(router.query.userId || '')} user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
