import Head from 'next/head';
import { CategoriesPage } from '@/modules/categories/client';
import { requirePageAuth } from '@/modules/auth/server';

export default function CategoriesRoute({ user }) {
  return (
    <>
      <Head>
        <title>分类管理 · 后台管理</title>
      </Head>
      <CategoriesPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
