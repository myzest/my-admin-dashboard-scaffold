import PageHeader from '@/components/PageHeader';
import AccountDetails from '../AccountDetails';
import PasswordForm from '../PasswordForm';
import AdminLayout from './AdminLayout';

export default function AdminProfilePage({ user }) {
  return (
    <AdminLayout user={user}>
      <PageHeader title="个人资料" />
      <AccountDetails user={user} roleLabel="管理员" />
      <PasswordForm endpoint="/api/admin/password" />
    </AdminLayout>
  );
}
