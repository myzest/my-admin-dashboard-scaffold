import Head from 'next/head';
import { site } from '@/config/site';
import { LoginForm } from '@/modules/auth/client';
import { getCurrentUser } from '@/modules/auth/server';
import { getHomePath } from '@/config/access';

export default function LoginPage() {
  return (
    <>
      <Head>
        <title>{`登录 · ${site.name}`}</title>
      </Head>
      <LoginForm />
    </>
  );
}

export async function getServerSideProps({ req, res }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await getCurrentUser(req, res);
  if (user) {
    return { redirect: { destination: getHomePath(user), permanent: false } };
  }
  return { props: {} };
}
