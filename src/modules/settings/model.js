import { DataTypes } from 'sequelize';
import { getDatabase } from '../../server/database.js';

export function getSettingsModel() {
  const database = getDatabase();
  return (
    database.models.SystemSettings ||
    database.define(
      'SystemSettings',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        allowRegistration: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      },
      { tableName: 'system_settings' },
    )
  );
}
