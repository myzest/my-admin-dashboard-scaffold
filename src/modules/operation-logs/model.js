import { DataTypes } from 'sequelize';
import { getDatabase } from '../../server/database.js';

export function getOperationLogModel() {
  const database = getDatabase();
  return (
    database.models.OperationLog ||
    database.define(
      'OperationLog',
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        operatorId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        operatorUsername: { type: DataTypes.STRING(64), allowNull: false },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        action: { type: DataTypes.STRING(64), allowNull: false },
        targetType: { type: DataTypes.STRING(32), allowNull: false },
        targetId: { type: DataTypes.INTEGER, allowNull: true },
        changes: { type: DataTypes.JSON, allowNull: false },
      },
      { tableName: 'operation_logs', updatedAt: false },
    )
  );
}
