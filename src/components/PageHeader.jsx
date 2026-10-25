import Head from 'next/head';
import { site } from '@/config/site';
import styles from '@/styles/workspace.module.css';

export default function PageHeader({ title, children }) {
  return (
    <>
      <Head>
        <title>{`${title} · ${site.name}`}</title>
      </Head>
      <div className={styles.pageHeading}>
        <h1>{title}</h1>
        {children}
      </div>
    </>
  );
}
