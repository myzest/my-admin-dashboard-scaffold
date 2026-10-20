import { Alert, Button } from '@arco-design/web-react';
import styles from '@/styles/workspace.module.css';

export default function RequestError({ error, onRetry }) {
  if (!error) return null;

  return (
    <Alert
      type="error"
      content={error.status === 401 ? '登录已失效，正在返回登录页。' : error.message}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
      role="alert"
      className={styles.error}
    />
  );
}
