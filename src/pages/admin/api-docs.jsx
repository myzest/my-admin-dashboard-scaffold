import { requirePageAuth } from '@/modules/auth/server';
import { openApiDocument } from '@/modules/openapi/server';

export { ApiDocsPage as default } from '@/modules/openapi/client';

export async function getServerSideProps(context) {
  const result = await requirePageAuth(context, { role: 'admin' });
  if (!result.props) return result;
  return { props: { ...result.props, apiDocument: openApiDocument } };
}
