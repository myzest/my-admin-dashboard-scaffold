import { DataTypes } from 'sequelize';
import { getDatabase } from '../../server/database.js';

export function getUserModel() {
  const database = getDatabase();
  return (
    database.models.User ||
    database.define(
      'User',
      {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        displayName: { type: DataTypes.STRING(64), allowNull: false, defaultValue: '' },
        passwordHash: { type: DataTypes.STRING(255), allowNull: false },
        role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'user' },
        isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        balance: { type: DataTypes.DECIMAL(20, 4), allowNull: false, defaultValue: '0.0000' },
      },
      { tableName: 'users' },
    )
  );
}

export function getBalanceLogModel() {
  const database = getDatabase();
  if (database.models.BalanceLog) return database.models.BalanceLog;
  const BalanceLog = database.define(
    'BalanceLog',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      operatorId: { type: DataTypes.INTEGER, allowNull: false },
      operationId: { type: DataTypes.STRING(36), allowNull: false },
      changeAmount: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      balanceBefore: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      balanceAfter: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: false },
    },
    { tableName: 'balance_logs', updatedAt: false },
  );
  BalanceLog.belongsTo(getUserModel(), { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
  BalanceLog.belongsTo(getUserModel(), {
    as: 'operator',
    foreignKey: 'operatorId',
    onDelete: 'RESTRICT',
  });
  return BalanceLog;
}
