import { DataTypes } from 'sequelize';

function timestamps() {
  return {
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  };
}

export async function up(queryInterface) {
  await queryInterface.createTable('admins', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    ...timestamps(),
  });
  await queryInterface.createTable('admin_sessions', {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'admins', key: 'id' },
      onDelete: 'CASCADE',
    },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  // MySQL DDL commits immediately; allow an interrupted initial migration to resume.
  const indexes = await queryInterface.showIndex('admin_sessions');
  if (!indexes.some((index) => index.name === 'admin_sessions_expiry')) {
    await queryInterface.addIndex('admin_sessions', ['expires_at'], {
      name: 'admin_sessions_expiry',
    });
  }
  await queryInterface.createTable('categories', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    is_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...timestamps(),
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('categories');
  await queryInterface.dropTable('admin_sessions');
  await queryInterface.dropTable('admins');
}
