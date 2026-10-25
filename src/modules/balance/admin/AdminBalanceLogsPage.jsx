import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Input } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { AdminLayout } from '@/modules/auth/admin/client';
import PageHeader from '@/components/PageHeader';
import ExpandableText from '@/components/ExpandableText';
import ListToolbar from '@/components/ListToolbar';
import RequestError from '@/components/RequestError';
import BalanceLogTable, { balanceLogColumns } from '../BalanceLogTable';
import styles from '@/styles/workspace.module.css';

const columns = [
  balanceLogColumns[0],
  {
    title: '用户',
    dataIndex: 'username',
    width: 150,
    render: (value) => <ExpandableText>{value}</ExpandableText>,
  },
  ...balanceLogColumns.slice(1),
];

export default function AdminBalanceLogsPage({ user }) {
  const router = useRouter();
  const activeUserId = typeof router.query.userId === 'string' ? router.query.userId : '';
  const [previousUserId, setPreviousUserId] = useState(activeUserId);
  const [userId, setUserId] = useState(activeUserId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync URL filters without remounting the toolbar and losing its open state.
  if (previousUserId !== activeUserId) {
    setPreviousUserId(activeUserId);
    setUserId(activeUserId);
    setPage(1);
  }

  const query = new URLSearchParams({ page, pageSize });
  if (activeUserId) query.set('userId', activeUserId);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/admin/balance-logs?${query}`,
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

  async function filterLogs(event) {
    event.preventDefault();
    setPage(1);
    const value = userId.trim();
    await router.replace({
      pathname: '/admin/balance-logs',
      query: value ? { userId: value } : {},
    });
  }

  return (
    <AdminLayout user={user}>
      <PageHeader title="余额日志" />
      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="余额日志列表">
        <ListToolbar
          activeFilterCount={Number(Boolean(activeUserId))}
          actions={
            <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshLogs}>
              刷新
            </Button>
          }
        >
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
        </ListToolbar>
        <RequestError error={error} onRetry={refreshLogs} />
        {!error || data ? (
          <BalanceLogTable
            data={data}
            isLoading={isLoading || isValidating}
            page={page}
            pageSize={pageSize}
            columns={columns}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        ) : null}
      </section>
    </AdminLayout>
  );
}
