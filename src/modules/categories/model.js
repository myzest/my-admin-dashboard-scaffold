import { DataTypes } from 'sequelize';
import { getDatabase } from '../../server/database.js';

export function getCategoryModel() {
  const database = getDatabase();
  return (
    database.models.Category ||
    database.define(
      'Category',
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
        isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      },
      { tableName: 'categories' },
    )
  );
}
