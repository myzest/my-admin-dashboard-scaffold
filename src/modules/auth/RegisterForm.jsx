import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button, Form, Spin } from '@arco-design/web-react';
import useSWR from 'swr';
import { request } from '@/lib/request';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';
import AccountFields from './AccountFields';
import AuthPanel from './AuthPanel';
import styles from './AuthPanel.module.css';

export default function RegisterForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const form = useFormErrors(error);
  const { data, error: loadError, isLoading, mutate } = useSWR('/api/auth/registration');

  async function register(values) {
    setIsSubmitting(true);
    setError(null);
    try {
      await request('/api/auth/register', { method: 'POST', body: values });
      await router.replace('/login?registered=1');
    } catch (requestError) {
      setError(requestError);
      if (requestError.code === 'REGISTRATION_CLOSED') await mutate();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPanel title="创建账号" description="注册后即可登录个人工作台。">
      <RequestError error={loadError} onRetry={() => mutate()} />
      {isLoading ? <Spin tip="正在加载…" /> : null}
      {!loadError && data?.allowRegistration === false ? (
        <Alert type="info" content="当前未开放注册，请联系管理员创建账号。" />
      ) : null}
      {data?.allowRegistration ? (
        <>
          <RequestError error={error} />
          <Form
            form={form}
            id="register-form"
            layout="vertical"
            size="large"
            onSubmit={register}
            disabled={isSubmitting}
          >
            <AccountFields includePassword />
            <Button type="primary" htmlType="submit" long size="large" loading={isSubmitting}>
              创建账号
            </Button>
          </Form>
        </>
      ) : null}
      <p className={styles.footer}>
        <Link href="/login">返回登录</Link>
      </p>
    </AuthPanel>
  );
}
