import {
  listCategories,
  createCategory,
  categoryQuerySchema,
  categorySchema,
} from '@/modules/categories/server';
import { createApiHandler } from '@/server/api-handler';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  GET: ({ req }) => listCategories(categoryQuerySchema.parse(req.query)),
  POST: async ({ body, res }) => {
    const category = await createCategory(categorySchema.parse(body));
    res.statusCode = 201;
    return category;
  },
});
