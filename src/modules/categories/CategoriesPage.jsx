import { useState } from 'react';
import { Alert, Button, Input, Message, Space } from '@arco-design/web-react';
import { IconPlus, IconRefresh, IconSearch } from '@arco-design/web-react/icon';
import usePaginatedList from '@/lib/usePaginatedList';
import { useAuthRequest } from '@/modules/auth/client';
import { AdminLayout } from '@/modules/auth/admin/client';
import ResponsiveModal from '@/components/ResponsiveModal';
import PageHeader from '@/components/PageHeader';
import ListToolbar from '@/components/ListToolbar';
import RequestError from '@/components/RequestError';
import CategoryFormModal from './CategoryFormModal';
import CategoryTable from './CategoryTable';
import styles from '@/styles/workspace.module.css';

export default function CategoriesPage({ user }) {
  const [message, messageHolder] = Message.useMessage();
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const request = useAuthRequest();
  const list = usePaginatedList('/api/admin/categories', { search });

  function openEditor(category = null) {
    setMutationError(null);
    setEditor({ category });
  }

  function openDelete(category) {
    setMutationError(null);
    setDeletingCategory(category);
  }

  async function saveCategory(values) {
    setIsMutating(true);
    setMutationError(null);
    try {
      const category = editor.category;
      await request(category ? `/api/admin/categories/${category.id}` : '/api/admin/categories', {
        method: category ? 'PUT' : 'POST',
        body: values,
      });
      setEditor(null);
      message.success(category ? '分类已更新' : '分类已创建');
      await list.refresh();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteCategory() {
    setIsMutating(true);
    setMutationError(null);
    try {
      await request(`/api/admin/categories/${deletingCategory.id}`, { method: 'DELETE' });
      setDeletingCategory(null);
      message.success('分类已删除');
      await list.refresh();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsMutating(false);
    }
  }

  function searchCategories(event) {
    event.preventDefault();
    list.setPage(1);
    setSearch(keyword.trim());
  }

  return (
    <AdminLayout user={user}>
      {messageHolder}
      <PageHeader title="分类管理">
        <Button type="primary" icon={<IconPlus />} onClick={() => openEditor()}>
          新增分类
        </Button>
      </PageHeader>

      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="分类列表">
        <ListToolbar
          activeFilterCount={Number(Boolean(search))}
          actions={
            <Button icon={<IconRefresh />} loading={list.isValidating} onClick={list.refresh}>
              刷新
            </Button>
          }
        >
          <form onSubmit={searchCategories} className={styles.search}>
            <Input
              aria-label="搜索分类名称"
              placeholder="搜索分类名称"
              prefix={<IconSearch />}
              allowClear
              maxLength={64}
              value={keyword}
              onChange={setKeyword}
            />
            <Button htmlType="submit">查询</Button>
          </form>
        </ListToolbar>

        <RequestError error={list.error} onRetry={list.refresh} />
        {!list.error || list.data ? (
          <CategoryTable
            data={list.data}
            isLoading={list.isLoading || list.isValidating}
            page={list.page}
            pageSize={list.pageSize}
            hasSearch={Boolean(search)}
            onPageChange={list.changePage}
            onEdit={openEditor}
            onDelete={openDelete}
          />
        ) : null}
      </section>

      {editor ? (
        <CategoryFormModal
          category={editor.category}
          isSaving={isMutating}
          error={mutationError}
          onSubmit={saveCategory}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      <ResponsiveModal
        title="删除分类"
        visible={Boolean(deletingCategory)}
        unmountOnExit
        maskClosable={false}
        closable={!isMutating}
        escToExit={!isMutating}
        confirmLoading={isMutating}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ status: 'danger' }}
        cancelButtonProps={{ disabled: isMutating }}
        onOk={deleteCategory}
        onCancel={() => setDeletingCategory(null)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <p className={styles.description}>
            确认删除“{deletingCategory?.name}”吗？删除后无法恢复。
          </p>
          {mutationError ? (
            <Alert type="error" content={mutationError.message} role="alert" />
          ) : null}
        </Space>
      </ResponsiveModal>
    </AdminLayout>
  );
}
