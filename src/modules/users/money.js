import Big from 'big.js';
import { HttpError } from '../../server/errors.js';

export const MAX_BALANCE = '9999999999999999.9999';

export function formatMoney(value) {
  if (typeof value !== 'string' || !/^-?\d{1,16}(?:\.\d{1,4})?$/.test(value)) {
    throw new HttpError(400, 'INVALID_AMOUNT', '金额必须为最多四位小数的十进制字符串');
  }
  return new Big(value).toFixed(4);
}

export function calculateBalance(balance, direction, amount) {
  const currentBalance = new Big(formatMoney(balance));
  const changeAmount = new Big(formatMoney(amount));
  if (!['increase', 'decrease'].includes(direction) || changeAmount.lte(0)) {
    throw new HttpError(400, 'INVALID_AMOUNT', '请选择增加或扣减，并输入大于零的金额');
  }
  const nextBalance =
    direction === 'increase'
      ? currentBalance.plus(changeAmount)
      : currentBalance.minus(changeAmount);
  if (nextBalance.lt(0)) {
    throw new HttpError(409, 'INSUFFICIENT_BALANCE', '余额不足');
  }
  if (nextBalance.gt(MAX_BALANCE)) {
    throw new HttpError(409, 'BALANCE_LIMIT_EXCEEDED', '余额超过可存储上限');
  }
  return nextBalance.toFixed(4);
}
