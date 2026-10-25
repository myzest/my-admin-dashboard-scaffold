import { requirePageAuth } from '@/modules/auth/server';

export { SettingsPage as default } from '@/modules/settings/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
