import { useState } from 'react';
import { Alert, Button, Input, Message, Modal, Space } from '@arco-design/web-react';
import { IconPlus, IconRefresh, IconSearch } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { useAuthRequest } from '@/modules/auth/client';
import { AdminLayout } from '@/modules/auth/admin/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import CategoryFormModal from './CategoryFormModal';
import CategoryTable from './CategoryTable';
import styles from '@/styles/workspace.module.css';

export default function CategoriesPage({ user }) {
  const [message, messageHolder] = Message.useMessage();
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const request = useAuthRequest();
  const query = new URLSearchParams({ page, pageSize, search });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/admin/categories?${query}`,
    {
      onSuccess: (result) => {
        const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      },
    },
  );

  function openEditor(category = null) {
    setMutationError(null);
    setEditor({ category });
  }

  function openDelete(category) {
    setMutationError(null);
    setDeletingCategory(category);
  }

  async function refreshList() {
    await mutate(undefined, { revalidate: true, populateCache: false, throwOnError: false });
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
      await refreshList();
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
      await refreshList();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsMutating(false);
    }
  }

  function searchCategories(event) {
    event.preventDefault();
    setPage(1);
    setSearch(keyword.trim());
  }

  return (
    <AdminLayout user={user}>
      {messageHolder}
      <PageHeader title="分类管理" description="管理分类名称、说明和启用状态。">
        <Button type="primary" icon={<IconPlus />} onClick={() => openEditor()}>
          新增分类
        </Button>
      </PageHeader>

      <section className={styles.panel} aria-label="分类列表">
        <div className={styles.toolbar}>
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
          <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshList}>
            刷新
          </Button>
        </div>

        <RequestError error={error} onRetry={refreshList} />
        {!error || data ? (
          <CategoryTable
            data={data}
            isLoading={isLoading || isValidating}
            page={page}
            pageSize={pageSize}
            hasSearch={Boolean(search)}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
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

      <Modal
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
        style={{ width: 'min(440px, calc(100vw - 32px))' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <p className={styles.description}>
            确认删除“{deletingCategory?.name}”吗？删除后无法恢复。
          </p>
          {mutationError ? (
            <Alert type="error" content={mutationError.message} role="alert" />
          ) : null}
        </Space>
      </Modal>
    </AdminLayout>
  );
}
