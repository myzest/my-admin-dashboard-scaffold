import { DataTypes } from 'sequelize';

export async function up(queryInterface) {
  const columns = await queryInterface.describeTable('users');
  if (!columns.is_enabled) {
    await queryInterface.addColumn('users', 'is_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }
}

export async function down() {
  throw new Error('此迁移包含账号启停状态，不支持自动回退；请从迁移前备份恢复对应版本');
}
