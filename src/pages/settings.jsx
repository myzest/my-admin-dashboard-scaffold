import Head from 'next/head';
import { SettingsPage } from '@/modules/settings/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function SettingsRoute({ user }) {
  return (
    <>
      <Head>
        <title>系统设置 · 后台管理</title>
      </Head>
      <SettingsPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
