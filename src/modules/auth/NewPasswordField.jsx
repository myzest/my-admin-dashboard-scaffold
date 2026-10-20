import { Form, Input } from '@arco-design/web-react';

export default function NewPasswordField({ field = 'password', label = '密码' }) {
  return (
    <Form.Item
      label={label}
      field={field}
      rules={[
        { required: true, message: `请输入${label}` },
        { minLength: 12, message: '密码至少 12 位' },
        {
          validator: (value, callback) =>
            callback(
              value && new TextEncoder().encode(value).length > 72
                ? '密码过长，最多支持 72 字节'
                : undefined,
            ),
        },
      ]}
    >
      <Input.Password placeholder="至少 12 位" autoComplete="new-password" maxLength={72} />
    </Form.Item>
  );
}
