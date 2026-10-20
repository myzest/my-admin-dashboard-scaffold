import { Op } from 'sequelize';
import { HttpError } from '../../server/errors.js';
import { getDatabase } from '../../server/database.js';
import { getCategoryModel } from './model.js';

export async function listCategories({ page, pageSize, search }) {
  // Escape SQL LIKE wildcards so the search box performs a literal substring match.
  const pattern = search.replace(/[\\%_]/g, '\\$&');
  const { rows, count } = await getCategoryModel().findAndCountAll({
    where: search ? { name: { [Op.like]: `%${pattern}%` } } : {},
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { items: rows.map((row) => row.toJSON()), pagination: { page, pageSize, total: count } };
}

export async function getCategoryById(id) {
  const category = await getCategoryModel().findByPk(id);
  return category ? category.toJSON() : null;
}

export async function createCategory(values) {
  const category = await getCategoryModel().create(values);
  return category.toJSON();
}

export async function updateCategory(id, values) {
  return getDatabase().transaction(async (transaction) => {
    const category = await getCategoryModel().findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
    await category.update(values, { transaction });
    return category.toJSON();
  });
}

export async function deleteCategory(id) {
  const deleted = await getCategoryModel().destroy({ where: { id } });
  if (!deleted) throw new HttpError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
  return {};
}
