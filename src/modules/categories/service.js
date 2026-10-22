import { Op, UniqueConstraintError } from 'sequelize';
import pick from 'lodash/pick.js';
import { HttpError } from '../../server/errors.js';
import { getDatabase } from '../../server/database.js';
import { getCategoryModel } from './model.js';
import { createOperationLog } from '../operation-logs/server.js';

function rethrowCategoryError(error) {
  if (error instanceof UniqueConstraintError) {
    throw new HttpError(409, 'DUPLICATE_RECORD', '名称已存在，请使用其他名称', {
      name: '名称已存在，请使用其他名称',
    });
  }
  throw error;
}

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

export function createCategory(values, operatorId) {
  return getDatabase().transaction(async (transaction) => {
    let category;
    try {
      category = await getCategoryModel().create(values, { transaction });
    } catch (error) {
      rethrowCategoryError(error);
    }
    await createOperationLog(
      { operatorId, action: 'CATEGORY_CREATED', targetId: category.id, after: category },
      { transaction },
    );
    return category.toJSON();
  });
}

export async function updateCategory(id, values, operatorId) {
  return getDatabase().transaction(async (transaction) => {
    const category = await getCategoryModel().findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
    const before = pick(category, ['name', 'description', 'isEnabled']);
    try {
      await category.update(values, { transaction });
    } catch (error) {
      rethrowCategoryError(error);
    }
    await createOperationLog(
      { operatorId, action: 'CATEGORY_UPDATED', targetId: category.id, before, after: category },
      { transaction },
    );
    return category.toJSON();
  });
}

export function deleteCategory(id, operatorId) {
  return getDatabase().transaction(async (transaction) => {
    const category = await getCategoryModel().findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', '分类不存在');
    await category.destroy({ transaction });
    await createOperationLog(
      { operatorId, action: 'CATEGORY_DELETED', targetId: id, before: category },
      { transaction },
    );
    return {};
  });
}
