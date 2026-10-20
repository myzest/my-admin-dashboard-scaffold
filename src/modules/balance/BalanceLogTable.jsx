import { Empty, Table } from '@arco-design/web-react';
import { formatDateTime } from '@/utils/date';
import styles from '@/styles/workspace.module.css';

export default function BalanceLogTable({
  data,
  isLoading,
  page,
  pageSize,
  showUser,
  onPageChange,
}) {
  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 180, render: formatDateTime },
    ...(showUser ? [{ title: '用户', dataIndex: 'username', width: 150, ellipsis: true }] : []),
    {
      title: '变动金额',
      dataIndex: 'changeAmount',
      width: 150,
      render: (value) => (
        <span className={styles.amount}>{value.startsWith('-') ? value : `+${value}`}</span>
      ),
    },
    {
      title: '变动前余额',
      dataIndex: 'balanceBefore',
      width: 160,
      render: (value) => <span className={styles.amount}>{value}</span>,
    },
    {
      title: '变动后余额',
      dataIndex: 'balanceAfter',
      width: 160,
      render: (value) => <span className={styles.amount}>{value}</span>,
    },
    { title: '原因', dataIndex: 'reason', width: 240 },
    { title: '操作人', dataIndex: 'operatorUsername', width: 150, ellipsis: true },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      data={data?.items || []}
      loading={isLoading}
      border={false}
      scroll={{ x: showUser ? 1190 : 1040 }}
      pagination={{
        current: page,
        pageSize,
        total: data?.pagination.total || 0,
        showTotal: true,
        sizeCanChange: true,
        sizeOptions: [10, 20, 50],
      }}
      onChange={({ current, pageSize: nextPageSize }) => onPageChange(current, nextPageSize)}
      noDataElement={isLoading ? '正在加载…' : <Empty description="暂无余额变动记录。" />}
    />
  );
}
