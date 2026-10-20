import { Sequelize } from 'sequelize';
import { getDatabaseConfig } from './config.js';

export function getDatabase() {
  if (!globalThis.adminStarterDatabase) {
    const config = getDatabaseConfig();
    globalThis.adminStarterDatabase = new Sequelize(
      config.DB_NAME,
      config.DB_USER,
      config.DB_PASSWORD,
      {
        dialect: 'mysql',
        host: config.DB_HOST,
        port: config.DB_PORT,
        timezone: '+00:00',
        logging: false,
        pool: { max: config.DB_POOL_MAX, min: 0, acquire: 10000, idle: 10000 },
        define: { underscored: true, freezeTableName: true },
      },
    );
  }
  return globalThis.adminStarterDatabase;
}
