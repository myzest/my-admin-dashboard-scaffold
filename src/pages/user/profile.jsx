import { requirePageAuth } from '@/modules/auth/server';

export { UserProfilePage as default } from '@/modules/auth/user/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'user' });
}
