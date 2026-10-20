import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Input } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { AuthenticatedLayout } from '@/modules/auth/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import BalanceLogTable from './BalanceLogTable';
import styles from '@/styles/workspace.module.css';

export default function BalanceLogsPage({ user }) {
  const router = useRouter();
  const isAdmin = user.role === 'admin';
  const activeUserId =
    isAdmin && typeof router.query.userId === 'string' ? router.query.userId : '';
  const [userId, setUserId] = useState(activeUserId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = new URLSearchParams({ page, pageSize });
  if (activeUserId) query.set('userId', activeUserId);
  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/balance-logs?${query}`, {
    onSuccess: (result) => {
      const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
      if (page > lastPage) setPage(lastPage);
    },
  });

  function refreshLogs() {
    return mutate(undefined, { revalidate: true, throwOnError: false });
  }

  async function filterLogs(event) {
    event.preventDefault();
    setPage(1);
    const value = userId.trim();
    await router.replace({ pathname: '/balance-logs', query: value ? { userId: value } : {} });
  }

  return (
    <AuthenticatedLayout user={user}>
      <PageHeader
        title="余额日志"
        description={isAdmin ? '查看用户余额变动和调整原因。' : '查看你的每一笔余额变动。'}
      />
      <section className={styles.panel} aria-label="余额日志列表">
        <div className={styles.toolbar}>
          {isAdmin ? (
            <form className={styles.search} onSubmit={filterLogs}>
              <Input
                aria-label="按用户 ID 筛选"
                placeholder="用户 ID，留空查看全部"
                inputMode="numeric"
                allowClear
                value={userId}
                onChange={setUserId}
              />
              <Button htmlType="submit">查询</Button>
            </form>
          ) : (
            <span />
          )}
          <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshLogs}>
            刷新
          </Button>
        </div>
        <RequestError error={error} onRetry={refreshLogs} />
        {!error || data ? (
          <BalanceLogTable
            data={data}
            isLoading={isLoading || isValidating}
            page={page}
            pageSize={pageSize}
            showUser={isAdmin}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        ) : null}
      </section>
    </AuthenticatedLayout>
  );
}
