import { z } from 'zod';
import { balanceChangeSchema } from '../users/client.js';

const pendingAdjustmentSchema = z
  .object({
    operationId: balanceChangeSchema.shape.operationId,
    payload: balanceChangeSchema.omit({ operationId: true }),
  })
  .strict();

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
    return pendingAdjustmentSchema.parse(JSON.parse(value));
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
