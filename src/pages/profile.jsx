import Head from 'next/head';
import { ProfilePage } from '@/modules/auth/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function ProfileRoute({ user }) {
  return (
    <>
      <Head>
        <title>个人资料 · 后台管理</title>
      </Head>
      <ProfilePage user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
