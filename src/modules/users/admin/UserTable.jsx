import Link from 'next/link';
import { Button, Dropdown, Empty, Menu, Space, Tag } from '@arco-design/web-react';
import AdaptiveTable from '@/components/AdaptiveTable';
import ExpandableText from '@/components/ExpandableText';
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
  onResetPassword,
  onChangeStatus,
}) {
  const columns = [
    { title: 'ID', dataIndex: 'id', width: 110, fixed: 'left' },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 160,
      fixed: 'left',
      render: (value) => <ExpandableText>{value}</ExpandableText>,
    },
    {
      title: '显示名称',
      dataIndex: 'displayName',
      width: 160,
      render: (value) => <ExpandableText>{value}</ExpandableText>,
    },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      width: 100,
      render: (isEnabled) => (
        <Tag color={isEnabled ? 'green' : 'gray'}>{isEnabled ? '已启用' : '已停用'}</Tag>
      ),
    },
    {
      title: '余额',
      dataIndex: 'balance',
      width: 220,
      align: 'right',
      render: (value) => <span className={styles.amount}>{value}</span>,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 224,
      fixed: 'right',
      render: (_, user) => (
        <Space size={0} className={styles.rowActions}>
          <Button type="text" size="small" onClick={() => onEdit(user)}>
            编辑
          </Button>
          <Button type="text" size="small" onClick={() => onAdjustBalance(user)}>
            调整余额
          </Button>
          <Dropdown
            trigger="click"
            triggerProps={{ containerScrollToClose: true, escToClose: true }}
            droplist={
              <Menu>
                {/* Let the link handle Enter; Arco's key handler moves focus before its click. */}
                <Menu.Item
                  key="logs"
                  wrapper={Link}
                  href={`/admin/balance-logs?userId=${user.id}`}
                  onKeyDown={undefined}
                >
                  日志
                </Menu.Item>
                <Menu.Item key="password" onClick={() => onResetPassword(user)}>
                  重置密码
                </Menu.Item>
                <Menu.Item key="status" onClick={() => onChangeStatus(user)}>
                  {user.isEnabled ? '停用' : '启用'}
                </Menu.Item>
                <Menu.Item key="delete" onClick={() => onDelete(user)}>
                  <span className={styles.danger}>删除</span>
                </Menu.Item>
              </Menu>
            }
          >
            <Button
              type="text"
              size="small"
              aria-haspopup="menu"
              onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
            >
              更多
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

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
