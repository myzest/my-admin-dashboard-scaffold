import { validate as isUuid } from 'uuid';

function getStorageKey(operatorId, userId) {
  return `pending-balance-adjustment:${operatorId}:${userId}`;
}

export function getPendingBalanceAdjustment(operatorId, userId) {
  let value;
  try {
    value = window.sessionStorage.getItem(getStorageKey(operatorId, userId));
  } catch {
    throw new Error('无法读取余额调整的恢复记录，请检查浏览器存储设置后重试。');
  }
  if (value === null) return null;

  try {
    const adjustment = JSON.parse(value);
    const payload = adjustment?.payload;
    if (
      !isUuid(adjustment?.operationId) ||
      !['increase', 'decrease'].includes(payload?.direction) ||
      typeof payload?.amount !== 'string' ||
      !/^\d{1,16}(\.\d{1,4})?$/.test(payload.amount) ||
      !/[1-9]/.test(payload.amount) ||
      typeof payload?.reason !== 'string' ||
      !payload.reason.trim() ||
      payload.reason.length > 500 ||
      Object.keys(adjustment).length !== 2 ||
      Object.keys(payload).length !== 3
    ) {
      throw new Error('Invalid pending balance adjustment');
    }
    return adjustment;
  } catch {
    throw new Error('余额调整的恢复记录无法识别，请保留浏览器数据并联系管理员核对。');
  }
}

export function createPendingBalanceAdjustment(operatorId, userId, adjustment) {
  try {
    window.sessionStorage.setItem(getStorageKey(operatorId, userId), JSON.stringify(adjustment));
  } catch {
    throw new Error('无法保存本次调整的恢复记录，请检查浏览器存储设置后重试。调整尚未发送。');
  }
}

export function deletePendingBalanceAdjustment(operatorId, userId) {
  try {
    window.sessionStorage.removeItem(getStorageKey(operatorId, userId));
  } catch {
    throw new Error('无法清除本次调整的恢复记录，请重试本次调整以确认结果。');
  }
}
