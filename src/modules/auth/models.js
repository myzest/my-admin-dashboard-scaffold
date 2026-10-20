import { DataTypes } from 'sequelize';
import { getDatabase } from '../../server/database.js';

export function getSessionModel() {
  const database = getDatabase();
  return (
    database.models.Session ||
    database.define(
      'Session',
      {
        id: { type: DataTypes.STRING(36), primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
      },
      { tableName: 'sessions', updatedAt: false },
    )
  );
}
