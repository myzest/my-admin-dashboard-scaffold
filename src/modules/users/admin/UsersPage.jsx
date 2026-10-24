import { useState } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import { IconPlus, IconRefresh, IconSearch } from '@arco-design/web-react/icon';
import useSWR, { useSWRConfig } from 'swr';
import ResponsiveModal from '@/components/ResponsiveModal';
import PageHeader from '@/components/PageHeader';
import ListToolbar from '@/components/ListToolbar';
import RequestError from '@/components/RequestError';
import { useAuthRequest } from '@/modules/auth/client';
import { AdminLayout } from '@/modules/auth/admin/client';
import { BalanceAdjustmentModal } from '@/modules/balance/admin/client';
import UserFormModal from './UserFormModal';
import UserTable from './UserTable';
import ResetPasswordModal from './ResetPasswordModal';
import styles from '@/styles/workspace.module.css';

export default function UsersPage({ user }) {
  const [message, messageHolder] = Message.useMessage();
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [balanceUser, setBalanceUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [statusUser, setStatusUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const request = useAuthRequest();
  const { mutate: mutateCache } = useSWRConfig();
  const query = new URLSearchParams({ page, pageSize, search });
  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/admin/users?${query}`, {
    onSuccess: (result) => {
      const lastPage = Math.max(1, Math.ceil(result.pagination.total / pageSize));
      if (page > lastPage) setPage(lastPage);
    },
  });

  function refreshList() {
    return mutate(undefined, { revalidate: true, populateCache: false, throwOnError: false });
  }

  function openEditor(account = null) {
    setMutationError(null);
    setEditor({ user: account });
  }

  async function saveUser(values) {
    setIsSaving(true);
    setMutationError(null);
    try {
      const account = editor.user;
      await request(account ? `/api/admin/users/${account.id}` : '/api/admin/users', {
        method: account ? 'PUT' : 'POST',
        body: values,
      });
      setEditor(null);
      message.success(account ? '用户已更新' : '用户已创建');
      await refreshList();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteUser() {
    setIsSaving(true);
    setMutationError(null);
    try {
      await request(`/api/admin/users/${deletingUser.id}`, { method: 'DELETE' });
      await mutateCache(
        (key) => typeof key === 'string' && key.startsWith('/api/admin/balance-logs'),
        undefined,
        { revalidate: false },
      );
      setDeletingUser(null);
      message.success('用户及其余额、日志、会话已删除');
      await refreshList();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus() {
    if (isSaving) return;
    const isEnabled = !statusUser.isEnabled;
    setIsSaving(true);
    setMutationError(null);
    try {
      await request(`/api/admin/users/${statusUser.id}/status`, {
        method: 'PUT',
        body: { isEnabled },
      });
      setStatusUser(null);
      message.success(isEnabled ? '用户已启用' : '用户已停用，登录会话已撤销');
      await refreshList();
    } catch (requestError) {
      setMutationError(requestError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminLayout user={user}>
      {messageHolder}
      <PageHeader title="用户管理" description="管理普通用户资料和余额。">
        <Button type="primary" icon={<IconPlus />} onClick={() => openEditor()}>
          新增用户
        </Button>
      </PageHeader>
      <section className={`${styles.panel} ${styles.listPanel}`} aria-label="用户列表">
        <ListToolbar
          activeFilterCount={Number(Boolean(search))}
          actions={
            <Button icon={<IconRefresh />} loading={isValidating} onClick={refreshList}>
              刷新
            </Button>
          }
        >
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(keyword.trim());
            }}
          >
            <Input
              aria-label="搜索用户名或显示名称"
              placeholder="搜索用户名或显示名称"
              prefix={<IconSearch />}
              allowClear
              maxLength={64}
              value={keyword}
              onChange={setKeyword}
            />
            <Button htmlType="submit">查询</Button>
          </form>
        </ListToolbar>
        <RequestError error={error} onRetry={refreshList} />
        {!error || data ? (
          <UserTable
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
            onDelete={(account) => {
              setMutationError(null);
              setDeletingUser(account);
            }}
            onAdjustBalance={setBalanceUser}
            onResetPassword={setResetUser}
            onChangeStatus={(account) => {
              setMutationError(null);
              setStatusUser(account);
            }}
          />
        ) : null}
      </section>
      {editor ? (
        <UserFormModal
          user={editor.user}
          isSaving={isSaving}
          error={mutationError}
          onSubmit={saveUser}
          onCancel={() => setEditor(null)}
        />
      ) : null}
      {balanceUser ? (
        <BalanceAdjustmentModal
          operatorId={user.id}
          user={balanceUser}
          onCancel={() => setBalanceUser(null)}
          onSuccess={async () => {
            setBalanceUser(null);
            message.success('余额已调整');
            await refreshList();
          }}
        />
      ) : null}
      {resetUser ? (
        <ResetPasswordModal
          user={resetUser}
          onCancel={() => setResetUser(null)}
          onSuccess={() => {
            setResetUser(null);
            message.success('密码已重置，登录会话已撤销');
          }}
        />
      ) : null}
      <ResponsiveModal
        title={statusUser?.isEnabled ? '停用用户' : '启用用户'}
        visible={Boolean(statusUser)}
        unmountOnExit
        maskClosable={false}
        closable={!isSaving}
        escToExit={!isSaving}
        confirmLoading={isSaving}
        okText={statusUser?.isEnabled ? '确认停用' : '确认启用'}
        cancelText="取消"
        cancelButtonProps={{ disabled: isSaving }}
        onOk={updateStatus}
        onCancel={() => setStatusUser(null)}
      >
        <p className={styles.description}>
          {statusUser?.isEnabled
            ? `确认停用“${statusUser.username}”吗？该用户将无法登录，已有登录会话会被撤销；账号、余额和日志仍会保留。`
            : `确认启用“${statusUser?.username}”吗？该用户可以重新登录，旧登录会话不会恢复。`}
        </p>
        <RequestError error={mutationError} />
      </ResponsiveModal>
      <ResponsiveModal
        title="删除用户"
        visible={Boolean(deletingUser)}
        unmountOnExit
        maskClosable={false}
        closable={!isSaving}
        escToExit={!isSaving}
        confirmLoading={isSaving}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ status: 'danger' }}
        cancelButtonProps={{ disabled: isSaving }}
        onOk={deleteUser}
        onCancel={() => setDeletingUser(null)}
      >
        <p className={styles.description}>
          确认删除“{deletingUser?.username}”吗？账号、剩余余额（{deletingUser?.balance}
          ）、全部余额日志、关联操作日志和登录会话将一并永久删除，无法恢复。
        </p>
        <RequestError error={mutationError} />
      </ResponsiveModal>
    </AdminLayout>
  );
}
