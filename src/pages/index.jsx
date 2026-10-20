export default function HomePage() {
  return null;
}

export async function getServerSideProps({ req, res }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await getCurrentUser(req, res);
  return { redirect: { destination: user ? getHomePath(user) : '/login', permanent: false } };
}
import { getCurrentUser } from '@/modules/auth/server';
import { getHomePath } from '@/config/access';
