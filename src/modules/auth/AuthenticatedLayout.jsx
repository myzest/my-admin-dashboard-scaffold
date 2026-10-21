import { useState } from 'react';
import { useRouter } from 'next/router';
import { Alert } from '@arco-design/web-react';
import { useSWRConfig } from 'swr';
import AppLayout from '@/components/AppLayout';
import useAuthRequest from './useAuthRequest';

export default function AuthenticatedLayout({ user, navigation, title, homePath, children }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const request = useAuthRequest();

  async function logout() {
    setIsLoggingOut(true);
    setError('');
    try {
      await request('/api/auth/logout', { method: 'POST' });
      await mutate(() => true, undefined, { revalidate: false });
      await router.replace('/login');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <AppLayout
      user={user}
      navigation={navigation}
      title={title}
      homePath={homePath}
      onLogout={logout}
      isLoggingOut={isLoggingOut}
    >
      {error ? (
        <Alert type="error" content={error} style={{ marginBottom: 20 }} role="alert" />
      ) : null}
      {children}
    </AppLayout>
  );
}
