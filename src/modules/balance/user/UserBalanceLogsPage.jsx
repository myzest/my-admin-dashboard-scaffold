import { Button } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import usePaginatedList from '@/lib/usePaginatedList';
import { UserLayout } from '@/modules/auth/user/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import BalanceLogTable from '../BalanceLogTable';
import styles from '@/styles/workspace.module.css';

export default function UserBalanceLogsPage({ user }) {
  const list = usePaginatedList('/api/user/balance-logs');

  return (
    <UserLayout user={user}>
      <PageHeader title="余额日志">
        <Button icon={<IconRefresh />} loading={list.isValidating} onClick={list.refresh}>
          刷新
        </Button>
      </PageHeader>
      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="余额日志列表">
        <RequestError error={list.error} onRetry={list.refresh} />
        {!list.error || list.data ? (
          <BalanceLogTable
            data={list.data}
            isLoading={list.isLoading || list.isValidating}
            page={list.page}
            pageSize={list.pageSize}
            onPageChange={list.changePage}
          />
        ) : null}
      </section>
    </UserLayout>
  );
}
