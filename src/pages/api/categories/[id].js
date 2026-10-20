import {
  getCategoryById,
  updateCategory,
  deleteCategory,
  categoryIdSchema,
  categorySchema,
} from '@/modules/categories/server';
import { createApiHandler } from '@/server/api-handler';
import { HttpError } from '@/server/errors';

export const config = { api: { bodyParser: false } };

export default createApiHandler({
  GET: async ({ req }) => {
    const category = await getCategoryById(categoryIdSchema.parse(req.query.id));
    if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
    return category;
  },
  PUT: ({ req, body }) =>
    updateCategory(categoryIdSchema.parse(req.query.id), categorySchema.parse(body)),
  DELETE: ({ req }) => deleteCategory(categoryIdSchema.parse(req.query.id)),
});
