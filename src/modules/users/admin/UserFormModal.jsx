import { useId } from 'react';
import { Form } from '@arco-design/web-react';
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
      okText={user ? '保存修改' : '创建用户'}
      confirmLoading={isSaving}
      okButtonProps={{ htmlType: 'submit', form: formId }}
      cancelButtonProps={{ disabled: isSaving }}
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
