import { useId } from 'react';
import { Button, Form, Space } from '@arco-design/web-react';
import ResponsiveModal from '@/components/ResponsiveModal';
import pick from 'lodash/pick';
import { AccountFields } from '@/modules/auth/client';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';

export default function UserFormModal({ user, isSaving, error, onSubmit, onCancel }) {
  const formId = useId();
  const form = useFormErrors(error);

  return (
    <ResponsiveModal
      visible
      title={user ? '编辑用户' : '新增用户'}
      footer={
        <Space>
          <Button onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" form={formId} loading={isSaving}>
            {user ? '保存修改' : '创建用户'}
          </Button>
        </Space>
      }
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSaving}
      escToExit={!isSaving}
    >
      <RequestError error={error} />
      <Form
        form={form}
        id={formId}
        layout="vertical"
        initialValues={
          user ? pick(user, ['username', 'displayName']) : { username: '', displayName: '' }
        }
        onSubmit={onSubmit}
        disabled={isSaving}
      >
        <AccountFields includePassword={!user} />
      </Form>
    </ResponsiveModal>
  );
}
