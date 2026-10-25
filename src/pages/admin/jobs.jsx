import Head from 'next/head';
import { site } from '@/config/site';
import { requirePageAuth } from '@/modules/auth/server';
import { JobBoardPage } from '@/modules/job-board/client';

export default function JobsRoute({ user }) {
  return (
    <>
      <Head>
        <title>{`后台任务 · ${site.name}`}</title>
      </Head>
      <JobBoardPage user={user} />
    </>
  );
}

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
