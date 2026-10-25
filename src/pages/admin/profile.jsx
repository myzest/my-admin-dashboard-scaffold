import { requirePageAuth } from '@/modules/auth/server';

export { AdminProfilePage as default } from '@/modules/auth/admin/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
