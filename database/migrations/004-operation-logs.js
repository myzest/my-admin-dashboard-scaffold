import { DataTypes } from 'sequelize';

export async function up(queryInterface) {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('operation_logs')) {
    await queryInterface.createTable('operation_logs', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      operator_username: { type: DataTypes.STRING(64), allowNull: false },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: DataTypes.STRING(64), allowNull: false },
      target_type: { type: DataTypes.STRING(32), allowNull: false },
      target_id: { type: DataTypes.INTEGER, allowNull: true },
      changes: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  // Each index is checked separately because MySQL DDL can commit before the runner records it.
  const indexes = await queryInterface.showIndex('operation_logs');
  for (const [name, fields] of [
    ['operation_logs_action_id', ['action', 'id']],
    ['operation_logs_target_id', ['target_type', 'target_id', 'id']],
    ['operation_logs_operator_id', ['operator_id', 'id']],
  ]) {
    if (!indexes.some((index) => index.name === name)) {
      await queryInterface.addIndex('operation_logs', fields, { name });
    }
  }
}

export async function down() {
  throw new Error('此迁移包含操作记录，不支持自动删除；请从迁移前备份恢复对应版本');
}
