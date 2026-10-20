import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { request } from '@/lib/request';

export default function useAuthRequest() {
  const router = useRouter();

  return useCallback(
    async (url, options) => {
      try {
        return await request(url, options);
      } catch (error) {
        if (error.status === 401) await router.replace('/login');
        throw error;
      }
    },
    [router],
  );
}
