import { Button, Empty, Space, Table, Tag } from '@arco-design/web-react';
import styles from '@/styles/workspace.module.css';
import { formatDateTime } from '@/utils/date';

export default function CategoryTable({
  data,
  isLoading,
  page,
  pageSize,
  hasSearch,
  onPageChange,
  onEdit,
  onDelete,
}) {
  const columns = [
    { title: '分类名称', dataIndex: 'name', width: 200, ellipsis: true },
    { title: '说明', dataIndex: 'description', ellipsis: true, render: (value) => value || '—' },
    {
      title: '状态',
      dataIndex: 'isEnabled',
      width: 100,
      render: (isEnabled) => (
        <Tag color={isEnabled ? 'green' : 'gray'}>{isEnabled ? '已启用' : '已停用'}</Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 144,
      render: (_, category) => (
        <Space size={4}>
          <Button type="text" size="small" onClick={() => onEdit(category)}>
            编辑
          </Button>
          <Button type="text" status="danger" size="small" onClick={() => onDelete(category)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.table}>
      <Table
        rowKey="id"
        columns={columns}
        data={data ? data.items : []}
        loading={isLoading}
        border={false}
        scroll={{ x: 850 }}
        pagination={{
          current: page,
          pageSize,
          total: data ? data.pagination.total : 0,
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
                hasSearch ? '没有匹配的分类，请调整关键词。' : '暂无分类，点击“新增分类”开始。'
              }
            />
          )
        }
      />
    </div>
  );
}
