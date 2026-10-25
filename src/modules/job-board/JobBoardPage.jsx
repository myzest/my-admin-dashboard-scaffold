import { useState } from 'react';
import { Spin } from '@arco-design/web-react';
import useSWR from 'swr';
import { AdminLayout } from '@/modules/auth/admin/client';
import RequestError from '@/components/RequestError';
import styles from './JobBoardPage.module.css';

function JobBoardFrame({ onError }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={styles.frameContainer} aria-busy={!isLoaded}>
      <iframe
        className={styles.frame}
        title="Bull Board 后台任务面板"
        src="/api/admin/bull-board"
        onLoad={(event) => {
          // Browsers fire load even for failed iframe responses; error is not emitted.
          if (event.currentTarget.contentDocument?.getElementById('__UI_CONFIG__')) {
            setIsLoaded(true);
          } else {
            onError(new Error('后台任务面板加载失败，请稍后重试'));
          }
        }}
      />
      {!isLoaded ? (
        <div className={styles.loading} role="status">
          <Spin tip="正在加载后台任务面板…" />
        </div>
      ) : null}
    </div>
  );
}

export default function JobBoardPage({ user }) {
  const [frameError, setFrameError] = useState(null);
  const { data, error, isLoading, mutate } = useSWR('/api/admin/bull-board/_status', {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    revalidateOnMount: true,
  });
  const displayError = error || frameError;

  function reloadBoard() {
    setFrameError(null);
    void mutate(undefined, { revalidate: true, throwOnError: false });
  }

  return (
    <AdminLayout user={user}>
      <section className={styles.board} aria-label="后台任务面板">
        {displayError ? (
          <div className={styles.error}>
            <RequestError
              error={displayError}
              onRetry={displayError.status === 401 ? undefined : reloadBoard}
            />
          </div>
        ) : isLoading || !data ? (
          <div className={styles.loading} role="status">
            <Spin tip="正在连接后台任务服务…" />
          </div>
        ) : (
          <JobBoardFrame onError={setFrameError} />
        )}
      </section>
    </AdminLayout>
  );
}
