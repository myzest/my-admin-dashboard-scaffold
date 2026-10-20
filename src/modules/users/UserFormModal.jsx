import { useId } from 'react';
import { Button, Form, Modal, Space } from '@arco-design/web-react';
import pick from 'lodash/pick';
import { AccountFields } from '@/modules/auth/client';
import RequestError from '@/components/RequestError';
import styles from '@/styles/workspace.module.css';

export default function UserFormModal({ user, isSaving, error, onSubmit, onCancel }) {
  const formId = useId();

  return (
    <Modal
      visible
      title={user ? '编辑用户' : '新增用户'}
      footer={null}
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSaving}
      escToExit={!isSaving}
      style={{ width: 'min(480px, calc(100vw - 32px))' }}
    >
      <RequestError error={error} />
      <Form
        id={formId}
        layout="vertical"
        initialValues={
          user ? pick(user, ['username', 'displayName']) : { username: '', displayName: '' }
        }
        onSubmit={onSubmit}
        disabled={isSaving}
      >
        <AccountFields includePassword={!user} />
        <div className={styles.formActions}>
          <Space>
            <Button onClick={onCancel} disabled={isSaving}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              {user ? '保存修改' : '创建用户'}
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
