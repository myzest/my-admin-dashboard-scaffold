import { requirePageAuth } from '@/modules/auth/server';

export { AdminBalanceLogsPage as default } from '@/modules/balance/admin/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
