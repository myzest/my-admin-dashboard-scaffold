import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Form, Input } from '@arco-design/web-react';
import { useSWRConfig } from 'swr';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';
import { changePasswordSchema } from '@/modules/users/client';
import { createFieldRules } from '@/lib/validation';
import NewPasswordField from './NewPasswordField';
import useAuthRequest from './useAuthRequest';
import styles from '@/styles/workspace.module.css';

export default function PasswordForm({ endpoint }) {
  const router = useRouter();
  const request = useAuthRequest();
  const { mutate } = useSWRConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const form = useFormErrors(error);

  async function updatePassword(values) {
    setIsSubmitting(true);
    setError(null);
    try {
      await request(endpoint, { method: 'POST', body: values });
      await mutate(() => true, undefined, { revalidate: false });
      await router.replace('/login?passwordChanged=1');
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="修改密码">
      <h2>修改密码</h2>
      <div className={styles.form}>
        <RequestError error={error} />
        <Form
          form={form}
          id="password-form"
          layout="vertical"
          onSubmit={updatePassword}
          disabled={isSubmitting}
        >
          <Form.Item
            label="当前密码"
            field="currentPassword"
            rules={createFieldRules(changePasswordSchema.shape.currentPassword)}
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
  );
}
