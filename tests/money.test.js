import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_BALANCE, calculateBalance, formatMoney } from '../src/modules/users/money.js';

test('money values use fixed four-decimal strings without losing large integer digits', () => {
  assert.equal(formatMoney('0'), '0.0000');
  assert.equal(formatMoney('1.2'), '1.2000');
  assert.equal(formatMoney('-0.0001'), '-0.0001');
  assert.equal(formatMoney(MAX_BALANCE), '9999999999999999.9999');
  assert.equal(calculateBalance('9999999999999999.9998', 'increase', '0.0001'), MAX_BALANCE);
  assert.equal(calculateBalance(MAX_BALANCE, 'decrease', '0.0001'), '9999999999999999.9998');
});

test('repeated smallest-unit adjustments stay exact', () => {
  let balance = '0.0000';
  for (let index = 0; index < 10000; index++) {
    balance = calculateBalance(balance, 'increase', '0.0001');
  }
  assert.equal(balance, '1.0000');
  assert.equal(calculateBalance(balance, 'decrease', '1.0000'), '0.0000');
});

test('money parsing rejects floats, scientific notation and excess precision', () => {
  for (const value of [0.1, NaN, null, undefined, '', '1e2', '1E-4', '0.00001', '1.20000']) {
    assert.throws(() => formatMoney(value), `invalid money ${String(value)}`);
  }
  for (const amount of ['0', '0.0000', '-1', '1.00001', 1]) {
    assert.throws(() => calculateBalance('1.0000', 'increase', amount));
  }
});

test('deductions cannot cross zero and additions cannot overflow the column', () => {
  assert.throws(() => calculateBalance('0.1000', 'decrease', '0.1001'), {
    status: 409,
    code: 'INSUFFICIENT_BALANCE',
  });
  assert.throws(() => calculateBalance(MAX_BALANCE, 'increase', '0.0001'), {
    status: 409,
    code: 'BALANCE_LIMIT_EXCEEDED',
  });
  assert.throws(() => calculateBalance('1.0000', 'replace', '1.0000'));
});
