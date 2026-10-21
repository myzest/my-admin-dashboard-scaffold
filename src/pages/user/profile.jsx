import Head from 'next/head';
import { site } from '@/config/site';
import { UserProfilePage } from '@/modules/auth/user/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function UserProfileRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`个人资料 · ${site.name}`}</title>
      </Head>
      <UserProfilePage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'user' });
}
