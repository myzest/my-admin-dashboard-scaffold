import {
  IconApps,
  IconHistory,
  IconSettings,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon';

export const adminNavigation = [
  { path: '/admin/users', label: '用户管理', icon: IconUserGroup },
  { path: '/admin/balance-logs', label: '余额日志', icon: IconHistory },
  { path: '/admin/categories', label: '分类示例', icon: IconApps },
  { path: '/admin/settings', label: '系统设置', icon: IconSettings },
  { path: '/admin/profile', label: '个人资料', icon: IconUser },
];
