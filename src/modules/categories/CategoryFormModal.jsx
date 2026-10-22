import { useId } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Switch } from '@arco-design/web-react';
import pick from 'lodash/pick';
import useFormErrors from '@/components/useFormErrors';
import { createFieldRules } from '@/lib/validation';
import { categorySchema } from './schema';
import styles from '@/styles/workspace.module.css';

export default function CategoryFormModal({ category, isSaving, error, onSubmit, onCancel }) {
  const formId = useId();
  const form = useFormErrors(error);
  const initialValues = category
    ? pick(category, ['name', 'description', 'isEnabled'])
    : { name: '', description: '', isEnabled: true };

  return (
    <Modal
      visible
      title={category ? '编辑分类' : '新增分类'}
      footer={null}
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSaving}
      escToExit={!isSaving}
      style={{ width: 'min(480px, calc(100vw - 32px))' }}
    >
      {error ? (
        <Alert type="error" content={error.message} role="alert" className={styles.error} />
      ) : null}
      <Form
        form={form}
        id={formId}
        layout="vertical"
        initialValues={initialValues}
        onSubmit={onSubmit}
        disabled={isSaving}
      >
        <Form.Item
          label="分类名称"
          field="name"
          rules={createFieldRules(categorySchema.shape.name)}
        >
          <Input placeholder="例如：产品动态" maxLength={64} autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="说明"
          field="description"
          rules={createFieldRules(categorySchema.shape.description)}
        >
          <Input.TextArea
            placeholder="简要说明分类的用途（选填）"
            maxLength={500}
            showWordLimit
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>
        <Form.Item
          label="启用状态"
          field="isEnabled"
          triggerPropName="checked"
          rules={createFieldRules(categorySchema.shape.isEnabled)}
        >
          <Switch checkedText="开" uncheckedText="关" aria-label="启用分类" />
        </Form.Item>
        <div className={styles.formActions}>
          <Space>
            <Button onClick={onCancel} disabled={isSaving}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={isSaving}>
              {category ? '保存修改' : '创建分类'}
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
