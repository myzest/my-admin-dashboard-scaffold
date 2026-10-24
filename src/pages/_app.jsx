import Head from 'next/head';
import { useRouter } from 'next/router';
import { ConfigProvider } from '@arco-design/web-react';
import zhCN from '@arco-design/web-react/lib/locale/zh-CN';
import { SWRConfig } from 'swr';
import { request } from '@/lib/request';
import LayoutPreferencesProvider from '@/components/LayoutPreferencesProvider';
import '@arco-design/web-react/dist/css/arco.css';
import '@/styles/globals.css';

const swrOptions = {
  fetcher: request,
  errorRetryCount: 2,
  shouldRetryOnError: (error) => !error.status || error.status >= 500,
};

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const userId = pageProps.user?.id;

  return (
    <ConfigProvider locale={zhCN} size="default">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <LayoutPreferencesProvider>
        <SWRConfig
          key={userId || 'guest'}
          value={{
            ...swrOptions,
            provider: () => new Map(),
            onError: (error) => {
              if (userId && error.status === 401) router.replace('/login');
            },
          }}
        >
          <Component {...pageProps} />
        </SWRConfig>
      </LayoutPreferencesProvider>
    </ConfigProvider>
  );
}
