import { useState } from 'react';
import { Button, Empty, Input, Select } from '@arco-design/web-react';
import AdaptiveTable from '@/components/AdaptiveTable';
import ExpandableText from '@/components/ExpandableText';
import { IconRefresh } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { AdminLayout } from '@/modules/auth/admin/client';
import PageHeader from '@/components/PageHeader';
import ListToolbar from '@/components/ListToolbar';
import RequestError from '@/components/RequestError';
import { formatDateTime } from '@/utils/date';
import {
  OPERATION_ACTION_LABELS,
  OPERATION_FIELD_LABELS,
  OPERATION_TARGET_LABELS,
} from './constants';
import styles from '@/styles/workspace.module.css';
import pageStyles from './OperationLogsPage.module.css';

const actionOptions = Object.entries(OPERATION_ACTION_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const targetOptions = Object.entries(OPERATION_TARGET_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const initialFilters = { action: '', targetType: '', targetId: '' };

function formatChangeValue(value) {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

const columns = [
  { title: '时间', dataIndex: 'createdAt', width: 180, fixed: 'left', render: formatDateTime },
  {
    title: '操作人',
    dataIndex: 'operatorUsername',
    width: 150,
    render: (value) => <ExpandableText>{value}</ExpandableText>,
  },
  {
    title: '动作',
    dataIndex: 'action',
    width: 150,
    render: (action) => OPERATION_ACTION_LABELS[action],
  },
  {
    title: '操作对象',
    width: 160,
    render: (_, record) =>
      record.action === 'USER_DELETED'
        ? '已删除用户'
        : `${OPERATION_TARGET_LABELS[record.targetType]} #${record.targetId}`,
  },
  {
    title: '变更摘要',
    dataIndex: 'changes',
    width: 420,
    render: (changes, record) => {
      const fields = Object.entries(changes);
      if (!fields.length) {
        return record.action === 'USER_DELETED' ? '账号及其关联日志、会话已清理' : '—';
      }
      return fields.map(([field, { before, after }]) => (
        <ExpandableText key={field}>
          {`${OPERATION_FIELD_LABELS[field]}：${formatChangeValue(before)} → ${formatChangeValue(after)}`}
        </ExpandableText>
      ));
    },
  },
];

export default function OperationLogsPage({ user }) {
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = new URLSearchParams({ page, pageSize });
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/admin/operation-logs?${query}`,
    {
      onSuccess: (result) => {
        const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      },
    },
  );

  function updateFilter(field, value) {
    setDraftFilters((current) => ({ ...current, [field]: value || '' }));
  }

  function filterLogs(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draftFilters, targetId: draftFilters.targetId.trim() });
  }

  function resetFilters() {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
  }

  function refreshLogs() {
    return mutate(undefined, { revalidate: true, populateCache: false, throwOnError: false });
  }

  return (
    <AdminLayout user={user}>
      <PageHeader title="操作日志" />
      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="操作日志列表">
        <ListToolbar
          activeFilterCount={Object.values(filters).filter(Boolean).length}
          actions={
            <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshLogs}>
              刷新
            </Button>
          }
        >
          <form className={pageStyles.filters} onSubmit={filterLogs}>
            <Select
              aria-label="按操作动作筛选"
              placeholder="全部动作"
              className={pageStyles.filter}
              allowClear
              options={actionOptions}
              value={draftFilters.action || undefined}
              onChange={(value) => updateFilter('action', value)}
            />
            <Select
              aria-label="按对象类型筛选"
              placeholder="全部对象类型"
              className={pageStyles.filter}
              allowClear
              options={targetOptions}
              value={draftFilters.targetType || undefined}
              onChange={(value) => updateFilter('targetType', value)}
            />
            <Input
              aria-label="按对象 ID 筛选"
              placeholder="对象 ID"
              className={pageStyles.filter}
              inputMode="numeric"
              allowClear
              maxLength={10}
              value={draftFilters.targetId}
              onChange={(value) => updateFilter('targetId', value)}
            />
            <Button htmlType="submit">查询</Button>
            <Button onClick={resetFilters}>重置</Button>
          </form>
        </ListToolbar>
        <RequestError error={error} onRetry={refreshLogs} />
        {!error || data ? (
          <AdaptiveTable
            rowKey="id"
            columns={columns}
            data={data?.items || []}
            loading={isLoading || isValidating}
            border={false}
            tableLayoutFixed
            scroll={{ x: columns.reduce((width, column) => width + column.width, 0) }}
            pagination={{
              current: page,
              pageSize,
              total: data?.pagination.total || 0,
              showTotal: true,
              sizeCanChange: true,
              sizeOptions: [10, 20, 50],
            }}
            onChange={({ current, pageSize: nextPageSize }) => {
              setPage(nextPageSize === pageSize ? current : 1);
              setPageSize(nextPageSize);
            }}
            noDataElement={
              isLoading ? '正在加载…' : <Empty description="没有符合条件的操作日志。" />
            }
          />
        ) : null}
      </section>
    </AdminLayout>
  );
}
