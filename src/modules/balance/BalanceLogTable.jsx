import { Empty, Table } from '@arco-design/web-react';
import { formatDateTime } from '@/utils/date';
import styles from '@/styles/workspace.module.css';

export const balanceLogColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 180, render: formatDateTime },
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

export default function BalanceLogTable({
  data,
  isLoading,
  page,
  pageSize,
  columns = balanceLogColumns,
  onPageChange,
}) {
  return (
    <Table
      rowKey="id"
      columns={columns}
      data={data?.items || []}
      loading={isLoading}
      border={false}
      scroll={{ x: columns.reduce((width, column) => width + column.width, 0) }}
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
