const homePaths = { admin: '/admin/users', user: '/user/dashboard' };

export function getHomePath(user) {
  return homePaths[user.role] || '/login';
}
