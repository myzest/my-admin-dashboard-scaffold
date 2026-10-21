import Head from 'next/head';
import { site } from '@/config/site';
import { DashboardPage } from '@/modules/balance/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function DashboardRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`工作台 · ${site.name}`}</title>
      </Head>
      <DashboardPage user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
