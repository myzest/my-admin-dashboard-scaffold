import { requirePageAuth } from '@/modules/auth/server';

export { UsersPage as default } from '@/modules/users/admin/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
