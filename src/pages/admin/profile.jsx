import Head from 'next/head';
import { site } from '@/config/site';
import { AdminProfilePage } from '@/modules/auth/admin/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function AdminProfileRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`个人资料 · ${site.name}`}</title>
      </Head>
      <AdminProfilePage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
