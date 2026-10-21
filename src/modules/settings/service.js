import { HttpError } from '../../server/errors.js';
import { getSettingsModel } from './model.js';

export async function getSettingsRecord(options) {
  const settings = await getSettingsModel().findByPk(1, options);
  if (!settings) {
    throw new HttpError(500, 'SETTINGS_NOT_INITIALIZED', '系统配置未初始化，请先执行数据库迁移');
  }
  return settings;
}

export async function getRegistrationSettings({ transaction, lock } = {}) {
  const settings = await getSettingsRecord({ transaction, lock });
  return { allowRegistration: settings.allowRegistration };
}
