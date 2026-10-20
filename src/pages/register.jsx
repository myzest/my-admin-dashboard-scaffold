import Head from 'next/head';
import { RegisterForm } from '@/modules/auth/client';
import { getCurrentUser } from '@/modules/auth/server';
import { getHomePath } from '@/config/access';

export default function RegisterPage() {
  return (
    <>
      <Head>
        <title>注册 · 后台管理</title>
      </Head>
      <RegisterForm />
    </>
  );
}

export async function getServerSideProps({ req, res }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await getCurrentUser(req, res);
  if (user) return { redirect: { destination: getHomePath(user), permanent: false } };
  return { props: {} };
}
