import { requirePageAuth } from '@/modules/auth/server';

export { CategoriesPage as default } from '@/modules/categories/client';

export function getServerSideProps(context) {
  return requirePageAuth(context, { role: 'admin' });
}
