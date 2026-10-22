import { Form, Input } from '@arco-design/web-react';
import { passwordSchema } from '@/modules/users/client';
import { createFieldRules } from '@/lib/validation';

export default function NewPasswordField({ field = 'password', label = '密码' }) {
  return (
    <Form.Item label={label} field={field} rules={createFieldRules(passwordSchema)}>
      <Input.Password placeholder="至少 6 位" autoComplete="new-password" maxLength={72} />
    </Form.Item>
  );
}
