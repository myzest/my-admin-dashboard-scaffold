import { fileURLToPath, pathToFileURL } from 'node:url';
import { Umzug, SequelizeStorage } from 'umzug';
import { getDatabase } from '../src/server/database.js';

export function createMigrator() {
  const database = getDatabase();
  return new Umzug({
    migrations: {
      glob: ['migrations/*.js', { cwd: fileURLToPath(new URL('.', import.meta.url)) }],
      resolve: ({ name, path, context }) => ({
        name,
        up: async () => (await import(pathToFileURL(path).href)).up(context),
        down: async () => (await import(pathToFileURL(path).href)).down(context),
      }),
    },
    context: database.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize: database, tableName: 'sequelize_meta' }),
    logger: console,
  });
}
