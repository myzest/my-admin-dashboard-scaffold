import Link from 'next/link';
import { Button, Empty, Space, Table } from '@arco-design/web-react';
import { formatDateTime } from '@/utils/date';
import styles from '@/styles/workspace.module.css';

export default function UserTable({
  data,
  isLoading,
  page,
  pageSize,
  hasSearch,
  onPageChange,
  onEdit,
  onDelete,
  onAdjustBalance,
}) {
  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '用户名', dataIndex: 'username', width: 160, ellipsis: true },
    { title: '显示名称', dataIndex: 'displayName', width: 160, ellipsis: true },
    {
      title: '余额',
      dataIndex: 'balance',
      width: 160,
      render: (value) => <span className={styles.amount}>{value}</span>,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 290,
      render: (_, user) => (
        <Space size={4}>
          <Button type="text" size="small" onClick={() => onEdit(user)}>
            编辑
          </Button>
          <Button type="text" size="small" onClick={() => onAdjustBalance(user)}>
            调整余额
          </Button>
          <Link href={`/balance-logs?userId=${user.id}`} className={styles.link}>
            日志
          </Link>
          <Button type="text" size="small" status="danger" onClick={() => onDelete(user)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      data={data?.items || []}
      loading={isLoading}
      border={false}
      scroll={{ x: 1020 }}
      pagination={{
        current: page,
        pageSize,
        total: data?.pagination.total || 0,
        showTotal: true,
        sizeCanChange: true,
        sizeOptions: [10, 20, 50],
      }}
      onChange={({ current, pageSize: nextPageSize }) => onPageChange(current, nextPageSize)}
      noDataElement={
        isLoading ? (
          '正在加载…'
        ) : (
          <Empty
            description={
              hasSearch ? '没有匹配的用户，请调整关键词。' : '暂无用户，点击“新增用户”开始。'
            }
          />
        )
      }
    />
  );
}
