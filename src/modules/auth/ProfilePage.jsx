import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Descriptions, Form, Input } from '@arco-design/web-react';
import { useSWRConfig } from 'swr';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import AuthenticatedLayout from './AuthenticatedLayout';
import NewPasswordField from './NewPasswordField';
import useAuthRequest from './useAuthRequest';
import styles from '@/styles/workspace.module.css';

export default function ProfilePage({ user }) {
  const router = useRouter();
  const request = useAuthRequest();
  const { mutate } = useSWRConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function updatePassword(values) {
    setIsSubmitting(true);
    setError(null);
    try {
      await request('/api/auth/password', { method: 'POST', body: values });
      await mutate(() => true, undefined, { revalidate: false });
      await router.replace('/login?passwordChanged=1');
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthenticatedLayout user={user}>
      <PageHeader title="个人资料" description="查看账号信息，管理登录密码。" />
      <section className={styles.panel} aria-label="账号信息">
        <Descriptions
          column={1}
          data={[
            { label: '用户名', value: user.username },
            { label: '显示名称', value: user.displayName },
            { label: '账号角色', value: user.role === 'admin' ? '管理员' : '普通用户' },
          ]}
        />
      </section>
      <section className={styles.panel} aria-label="修改密码">
        <h2>修改密码</h2>
        <p className={styles.description}>
          修改成功后，所有设备上的登录会话将失效，请使用新密码重新登录。
        </p>
        <div className={styles.form}>
          <RequestError error={error} />
          <Form
            id="password-form"
            layout="vertical"
            onSubmit={updatePassword}
            disabled={isSubmitting}
          >
            <Form.Item
              label="当前密码"
              field="currentPassword"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password
                placeholder="请输入当前密码"
                autoComplete="current-password"
                maxLength={72}
              />
            </Form.Item>
            <NewPasswordField field="newPassword" label="新密码" />
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              修改密码
            </Button>
          </Form>
        </div>
      </section>
    </AuthenticatedLayout>
  );
}
