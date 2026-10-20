import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button, Form, Input } from '@arco-design/web-react';
import { IconLock, IconUser } from '@arco-design/web-react/icon';
import useSWR from 'swr';
import { request } from '@/lib/request';
import { getHomePath } from '@/config/access';
import RequestError from '@/components/RequestError';
import AuthPanel from './AuthPanel';
import styles from './AuthPanel.module.css';

export default function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { data: registration, error: registrationError, mutate } = useSWR('/api/auth/registration');

  async function login(values) {
    setError('');
    setIsSubmitting(true);
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: values });
      await router.replace(getHomePath(result.user));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPanel title="登录工作台" description="使用你的账号继续。">
      {router.query.registered === '1' ? (
        <Alert type="success" content="账号已创建，请登录。" className={styles.error} />
      ) : null}
      {router.query.passwordChanged === '1' ? (
        <Alert type="success" content="密码已修改，请重新登录。" className={styles.error} />
      ) : null}
      {error ? <Alert type="error" content={error} className={styles.error} role="alert" /> : null}
      <Form id="login-form" layout="vertical" size="large" onSubmit={login} disabled={isSubmitting}>
        <Form.Item
          label="账号"
          field="username"
          rules={[{ required: true, message: '请输入账号' }]}
        >
          <Input
            prefix={<IconUser />}
            autoComplete="username"
            placeholder="请输入账号"
            maxLength={64}
          />
        </Form.Item>
        <Form.Item
          label="密码"
          field="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<IconLock />}
            autoComplete="current-password"
            placeholder="请输入密码"
            maxLength={72}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" long size="large" loading={isSubmitting}>
          登录
        </Button>
      </Form>
      <RequestError
        error={registrationError}
        onRetry={() => mutate(undefined, { revalidate: true, throwOnError: false })}
      />
      {registration?.allowRegistration ? (
        <p className={styles.footer}>
          还没有账号？<Link href="/register">创建账号</Link>
        </p>
      ) : null}
    </AuthPanel>
  );
}
