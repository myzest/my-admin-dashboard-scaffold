import { adminNavigation } from '@/config/admin-navigation';
import AuthenticatedLayout from '../AuthenticatedLayout';

export default function AdminLayout({ user, children }) {
  return (
    <AuthenticatedLayout
      user={user}
      navigation={adminNavigation}
      title="管理工作台"
      homePath="/admin/users"
    >
      {children}
    </AuthenticatedLayout>
  );
}
