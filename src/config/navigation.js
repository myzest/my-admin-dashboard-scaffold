import {
  IconApps,
  IconDashboard,
  IconHistory,
  IconSettings,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon';

export const navigation = [
  { path: '/dashboard', label: '工作台', icon: IconDashboard, roles: ['user'] },
  { path: '/users', label: '用户管理', icon: IconUserGroup, roles: ['admin'] },
  { path: '/balance-logs', label: '余额日志', icon: IconHistory },
  { path: '/categories', label: '分类示例', icon: IconApps, roles: ['admin'] },
  { path: '/settings', label: '系统设置', icon: IconSettings, roles: ['admin'] },
  { path: '/profile', label: '个人资料', icon: IconUser },
];
