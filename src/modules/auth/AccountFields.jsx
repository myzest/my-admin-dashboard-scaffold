import { Form, Input } from '@arco-design/web-react';
import NewPasswordField from './NewPasswordField';

export default function AccountFields({ includePassword = false }) {
  return (
    <>
      <Form.Item
        label="用户名"
        field="username"
        rules={[
          { required: true, message: '请输入用户名' },
          { minLength: 5, message: '用户名至少 5 位' },
          { match: /^[a-zA-Z0-9_-]+$/, message: '用户名仅支持字母、数字、下划线和短横线' },
        ]}
      >
        <Input
          autoComplete="username"
          placeholder="至少 5 位，支持字母、数字、下划线或短横线"
          maxLength={64}
        />
      </Form.Item>
      <Form.Item label="显示名称" field="displayName">
        <Input placeholder="选填，默认使用用户名" autoComplete="nickname" maxLength={64} />
      </Form.Item>
      {includePassword ? <NewPasswordField /> : null}
    </>
  );
}
