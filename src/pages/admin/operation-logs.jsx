import { requirePageAuth } from '@/modules/auth/server';

export { OperationLogsPage as default } from '@/modules/operation-logs/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
