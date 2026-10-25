import { useState } from 'react';
import { Button, Form, Message, Spin, Switch } from '@arco-design/web-react';
import useSWR from 'swr';
import { useAuthRequest } from '@/modules/auth/client';
import { AdminLayout } from '@/modules/auth/admin/client';
import PageHeader from '@/components/PageHeader';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';
import { createFieldRules } from '@/lib/validation';
import { registrationSettingsSchema } from './schema';
import styles from '@/styles/workspace.module.css';

export default function SettingsPage({ user }) {
  const [message, messageHolder] = Message.useMessage();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const form = useFormErrors(saveError);
  const request = useAuthRequest();
  const { data, error, isLoading, mutate } = useSWR('/api/admin/settings/registration');

  async function saveSettings(values) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await request('/api/admin/settings/registration', {
        method: 'PUT',
        body: values,
      });
      await mutate(result, { revalidate: false });
      message.success('注册设置已保存');
    } catch (requestError) {
      setSaveError(requestError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminLayout user={user}>
      {messageHolder}
      <PageHeader title="系统设置" />
      <section className={styles.panel} aria-label="注册设置">
        <h2>注册设置</h2>
        <RequestError error={error} onRetry={() => mutate()} />
        {isLoading ? <Spin tip="正在加载…" /> : null}
        {data ? (
          <div className={styles.form}>
            <RequestError error={saveError} />
            <Form
              form={form}
              key={String(data.allowRegistration)}
              id="registration-settings-form"
              layout="vertical"
              initialValues={data}
              onSubmit={saveSettings}
              disabled={isSaving}
            >
              <Form.Item
                label="允许自行注册"
                field="allowRegistration"
                triggerPropName="checked"
                rules={createFieldRules(registrationSettingsSchema.shape.allowRegistration)}
              >
                <Switch checkedText="开" uncheckedText="关" aria-label="允许自行注册" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={isSaving}>
                保存设置
              </Button>
            </Form>
          </div>
        ) : null}
      </section>
    </AdminLayout>
  );
}
