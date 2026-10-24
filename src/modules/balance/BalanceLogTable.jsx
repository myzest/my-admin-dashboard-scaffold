import { Empty } from '@arco-design/web-react';
import AdaptiveTable from '@/components/AdaptiveTable';
import ExpandableText from '@/components/ExpandableText';
import { formatDateTime } from '@/utils/date';
import styles from '@/styles/workspace.module.css';

export const balanceLogColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 180, fixed: 'left', render: formatDateTime },
  {
    title: '变动金额',
    dataIndex: 'changeAmount',
    width: 220,
    align: 'right',
    render: (value) => (
      <span className={styles.amount}>{value.startsWith('-') ? value : `+${value}`}</span>
    ),
  },
  {
    title: '变动前余额',
    dataIndex: 'balanceBefore',
    width: 220,
    align: 'right',
    render: (value) => <span className={styles.amount}>{value}</span>,
  },
  {
    title: '变动后余额',
    dataIndex: 'balanceAfter',
    width: 220,
    align: 'right',
    render: (value) => <span className={styles.amount}>{value}</span>,
  },
  {
    title: '原因',
    dataIndex: 'reason',
    width: 240,
    render: (value) => <ExpandableText>{value}</ExpandableText>,
  },
  {
    title: '操作人',
    dataIndex: 'operatorUsername',
    width: 150,
    render: (value) => <ExpandableText>{value}</ExpandableText>,
  },
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
    <AdaptiveTable
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
