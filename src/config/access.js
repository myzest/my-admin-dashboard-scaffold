export function getHomePath(user) {
  return user.role === 'admin' ? '/users' : '/dashboard';
}
