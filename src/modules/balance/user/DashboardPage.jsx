import Link from 'next/link';
import { Button, Descriptions } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { UserLayout } from '@/modules/auth/user/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import styles from '@/styles/workspace.module.css';
import dashboardStyles from './DashboardPage.module.css';

export default function DashboardPage({ user }) {
  const { data, error, isValidating, mutate } = useSWR('/api/user/me', { fallbackData: { user } });
  const account = data.user;

  function refreshAccount() {
    return mutate();
  }

  return (
    <UserLayout user={account}>
      <PageHeader title="工作台" description={`你好，${account.displayName || account.username}。`}>
        <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshAccount}>
          刷新
        </Button>
      </PageHeader>
      <RequestError error={error} onRetry={refreshAccount} />
      <section className={styles.panel} aria-label="我的余额">
        <h2>我的余额</h2>
        <p className={dashboardStyles.balance}>{account.balance}</p>
        <Link href="/user/balance-logs" className={styles.link}>
          查看余额日志 →
        </Link>
      </section>
      <section className={styles.panel} aria-label="我的账号">
        <h2>我的账号</h2>
        <Descriptions
          column={1}
          data={[
            { label: '用户名', value: account.username },
            { label: '显示名称', value: account.displayName },
          ]}
        />
        <Link href="/user/profile" className={styles.link}>
          管理个人资料 →
        </Link>
      </section>
    </UserLayout>
  );
}
