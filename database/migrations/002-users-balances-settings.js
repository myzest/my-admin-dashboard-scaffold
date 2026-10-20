import { col, DataTypes, QueryTypes } from 'sequelize';

async function renameTableIfNeeded(queryInterface, oldName, newName) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes(oldName) && tables.includes(newName)) {
    throw new Error(`迁移冲突：${oldName} 和 ${newName} 同时存在，请先核对数据`);
  }
  if (tables.includes(oldName)) {
    await queryInterface.renameTable(oldName, newName);
  } else if (!tables.includes(newName)) {
    throw new Error(`迁移缺少 ${oldName} 表，请先执行初始迁移`);
  }
}

async function addIndexIfNeeded(queryInterface, table, fields, options) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === options.name)) {
    await queryInterface.addIndex(table, fields, options);
  }
}

export async function up(queryInterface) {
  // MySQL commits DDL immediately. Each step can resume without resetting existing accounts or money.
  await renameTableIfNeeded(queryInterface, 'admins', 'users');
  const userColumns = await queryInterface.describeTable('users');
  if (!userColumns.display_name) {
    await queryInterface.addColumn('users', 'display_name', {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
    });
  }
  if (!userColumns.role) {
    // Only pre-existing accounts become admins; a retry must never elevate newer ordinary users.
    await queryInterface.addColumn('users', 'role', {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'admin',
    });
  }
  if (userColumns.role?.defaultValue !== 'user') {
    await queryInterface.changeColumn('users', 'role', {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'user',
    });
  }
  if (!userColumns.balance) {
    await queryInterface.addColumn('users', 'balance', {
      type: DataTypes.DECIMAL(20, 4),
      allowNull: false,
      defaultValue: '0.0000',
    });
  }
  await queryInterface.bulkUpdate('users', { display_name: col('username') }, { display_name: '' });

  await renameTableIfNeeded(queryInterface, 'admin_sessions', 'sessions');
  const sessionColumns = await queryInterface.describeTable('sessions');
  if (sessionColumns.admin_id && sessionColumns.user_id) {
    throw new Error('迁移冲突：sessions 同时存在 admin_id 和 user_id，请先核对数据');
  }
  if (sessionColumns.admin_id) {
    await queryInterface.renameColumn('sessions', 'admin_id', 'user_id');
  } else if (!sessionColumns.user_id) {
    throw new Error('sessions 缺少用户关联字段，请核对数据库结构');
  }

  const tables = await queryInterface.showAllTables();
  if (!tables.includes('balance_logs')) {
    await queryInterface.createTable('balance_logs', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      operation_id: { type: DataTypes.STRING(36), allowNull: false },
      change_amount: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      balance_before: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      balance_after: { type: DataTypes.DECIMAL(20, 4), allowNull: false },
      reason: { type: DataTypes.STRING(500), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfNeeded(queryInterface, 'balance_logs', ['user_id', 'operation_id'], {
    name: 'balance_logs_user_operation',
    unique: true,
  });
  await addIndexIfNeeded(queryInterface, 'balance_logs', ['user_id', 'id'], {
    name: 'balance_logs_user_id',
  });

  if (!tables.includes('system_settings')) {
    await queryInterface.createTable('system_settings', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      allow_registration: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  const settings = await queryInterface.sequelize.query(
    'SELECT id FROM system_settings WHERE id = 1',
    {
      type: QueryTypes.SELECT,
    },
  );
  if (!settings.length) {
    const now = new Date();
    await queryInterface.bulkInsert('system_settings', [
      { id: 1, allow_registration: false, created_at: now, updated_at: now },
    ]);
  }
}

export async function down() {
  throw new Error('此迁移包含用户和余额数据，不支持自动回退；请从迁移前备份恢复对应版本');
}
