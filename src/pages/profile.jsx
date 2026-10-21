import Head from 'next/head';
import { site } from '@/config/site';
import { ProfilePage } from '@/modules/auth/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function ProfileRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`个人资料 · ${site.name}`}</title>
      </Head>
      <ProfilePage user={user} />
    </>
  );
}

export const getServerSideProps = requirePageAuth;
