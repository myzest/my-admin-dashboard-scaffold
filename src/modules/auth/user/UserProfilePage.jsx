import PageHeader from '@/components/PageHeader';
import AccountDetails from '../AccountDetails';
import PasswordForm from '../PasswordForm';
import UserLayout from './UserLayout';

export default function UserProfilePage({ user }) {
  return (
    <UserLayout user={user}>
      <PageHeader title="个人资料" description="查看账号信息，管理登录密码。" />
      <AccountDetails user={user} roleLabel="普通用户" />
      <PasswordForm endpoint="/api/user/password" />
    </UserLayout>
  );
}
