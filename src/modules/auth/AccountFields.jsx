import { Form, Input } from '@arco-design/web-react';
import { createUserSchema } from '@/modules/users/client';
import { createFieldRules } from '@/lib/validation';
import NewPasswordField from './NewPasswordField';

export default function AccountFields({ includePassword = false }) {
  return (
    <>
      <Form.Item
        label="用户名"
        field="username"
        rules={createFieldRules(createUserSchema.shape.username)}
      >
        <Input
          autoComplete="username"
          placeholder="至少 5 位，支持字母、数字、下划线或短横线"
          maxLength={64}
        />
      </Form.Item>
      <Form.Item
        label="显示名称"
        field="displayName"
        rules={createFieldRules(createUserSchema.shape.displayName)}
      >
        <Input placeholder="选填，默认使用用户名" autoComplete="nickname" maxLength={64} />
      </Form.Item>
      {includePassword ? <NewPasswordField /> : null}
    </>
  );
}
