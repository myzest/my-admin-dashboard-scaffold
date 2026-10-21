import Head from 'next/head';
import { site } from '@/config/site';
import { UserBalanceLogsPage } from '@/modules/balance/user/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function UserBalanceLogsRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`余额日志 · ${site.name}`}</title>
      </Head>
      <UserBalanceLogsPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'user' });
}
