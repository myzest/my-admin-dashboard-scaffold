import { useId, useState } from 'react';
import { Button, Form, Space } from '@arco-design/web-react';
import ResponsiveModal from '@/components/ResponsiveModal';
import { NewPasswordField, useAuthRequest } from '@/modules/auth/client';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';
import styles from '@/styles/workspace.module.css';

export default function ResetPasswordModal({ user, onCancel, onSuccess }) {
  const formId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const form = useFormErrors(error);
  const request = useAuthRequest();

  async function resetPassword(values) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await request(`/api/admin/users/${user.id}/password`, { method: 'POST', body: values });
      onSuccess();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ResponsiveModal
      visible
      title="重置密码"
      footer={
        <Space>
          <Button onClick={onCancel} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" form={formId} loading={isSubmitting}>
            确认重置
          </Button>
        </Space>
      }
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSubmitting}
      escToExit={!isSubmitting}
    >
      <p className={styles.description}>
        为“{user.username}”设置新密码。重置后，该用户所有设备上的登录会话都会失效。
      </p>
      <RequestError error={error} />
      <Form
        form={form}
        id={formId}
        layout="vertical"
        onSubmit={resetPassword}
        disabled={isSubmitting}
      >
        <NewPasswordField field="newPassword" label="新密码" />
      </Form>
    </ResponsiveModal>
  );
}
