import { useState } from 'react';
import { Button } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { UserLayout } from '@/modules/auth/user/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import BalanceLogTable from '../BalanceLogTable';
import styles from '@/styles/workspace.module.css';

export default function UserBalanceLogsPage({ user }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = new URLSearchParams({ page, pageSize });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/user/balance-logs?${query}`,
    {
      onSuccess: (result) => {
        const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      },
    },
  );

  function refreshLogs() {
    return mutate(undefined, { revalidate: true, populateCache: false, throwOnError: false });
  }

  return (
    <UserLayout user={user}>
      <PageHeader title="余额日志" description="查看你的每一笔余额变动。">
        <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshLogs}>
          刷新
        </Button>
      </PageHeader>
      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="余额日志列表">
        <RequestError error={error} onRetry={refreshLogs} />
        {!error || data ? (
          <BalanceLogTable
            data={data}
            isLoading={isLoading || isValidating}
            page={page}
            pageSize={pageSize}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        ) : null}
      </section>
    </UserLayout>
  );
}
