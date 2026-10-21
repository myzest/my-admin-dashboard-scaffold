import { useId, useState } from 'react';
import { Button, Form, Modal, Space } from '@arco-design/web-react';
import { NewPasswordField, useAuthRequest } from '@/modules/auth/client';
import RequestError from '@/components/RequestError';
import styles from '@/styles/workspace.module.css';

export default function ResetPasswordModal({ user, onCancel, onSuccess }) {
  const formId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
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
    <Modal
      visible
      title="重置密码"
      footer={null}
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSubmitting}
      escToExit={!isSubmitting}
      style={{ width: 'min(480px, calc(100vw - 32px))' }}
    >
      <p className={styles.description}>
        为“{user.username}”设置新密码。重置后，该用户所有设备上的登录会话都会失效。
      </p>
      <RequestError error={error} />
      <Form id={formId} layout="vertical" onSubmit={resetPassword} disabled={isSubmitting}>
        <NewPasswordField field="newPassword" label="新密码" />
        <div className={styles.formActions}>
          <Space>
            <Button onClick={onCancel} disabled={isSubmitting}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              确认重置
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
