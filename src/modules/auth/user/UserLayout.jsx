import { userNavigation } from '@/config/user-navigation';
import AuthenticatedLayout from '../AuthenticatedLayout';

export default function UserLayout({ user, children }) {
  return (
    <AuthenticatedLayout
      user={user}
      navigation={userNavigation}
      title="个人工作台"
      homePath="/user/dashboard"
    >
      {children}
    </AuthenticatedLayout>
  );
}
