import Head from 'next/head';
import { site } from '@/config/site';
import { UsersPage } from '@/modules/users/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function UsersRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`用户管理 · ${site.name}`}</title>
      </Head>
      <UsersPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
