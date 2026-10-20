import Head from 'next/head';
import { DashboardPage } from '@/modules/balance/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function DashboardRoute({ user }) {
  return (
    <>
      <Head>
        <title>工作台 · 后台管理</title>
      </Head>
      <DashboardPage user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
