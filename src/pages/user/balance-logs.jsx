import { requirePageAuth } from '@/modules/auth/server';

export { UserBalanceLogsPage as default } from '@/modules/balance/user/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'user' });
}
