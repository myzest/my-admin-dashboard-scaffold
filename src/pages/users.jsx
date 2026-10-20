import Head from 'next/head';
import { UsersPage } from '@/modules/users/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function UsersRoute({ user }) {
  return (
    <>
      <Head>
        <title>用户管理 · 后台管理</title>
      </Head>
      <UsersPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
