import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  createPendingBalanceAdjustment,
  getPendingBalanceAdjustment,
} from '../src/modules/balance/balance-adjustment-storage.js';

test('pending adjustments recover valid normalized values without changing operation identity', (context) => {
  const storage = new Map();
  globalThis.window = {
    sessionStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: (key) => storage.get(key) ?? null,
    },
  };
  context.after(() => delete globalThis.window);
  const operationId = randomUUID();
  createPendingBalanceAdjustment(1, 2, {
    operationId,
    payload: { direction: 'increase', amount: ' 1.2345 ', reason: ' 原因 ' },
  });
  assert.deepEqual(getPendingBalanceAdjustment(1, 2), {
    operationId,
    payload: { direction: 'increase', amount: '1.2345', reason: '原因' },
  });
  assert.equal(getPendingBalanceAdjustment(1, 3), null);
});

test('pending adjustments reject malformed records and invalid business values', (context) => {
  let record;
  globalThis.window = {
    sessionStorage: { getItem: () => record },
  };
  context.after(() => delete globalThis.window);
  const valid = {
    operationId: randomUUID(),
    payload: { direction: 'increase', amount: '1.2345', reason: '原因' },
  };
  for (const value of [
    null,
    {},
    { ...valid, extra: true },
    { ...valid, operationId: 'invalid' },
    ...[
      { amount: 1.2345 },
      { amount: '0' },
      { amount: '1.23456' },
      { reason: '  ' },
      { direction: 'invalid' },
      { extra: true },
    ].map((changes) => ({ ...valid, payload: { ...valid.payload, ...changes } })),
  ]) {
    record = JSON.stringify(value);
    assert.throws(() => getPendingBalanceAdjustment(1, 2), /恢复记录无法识别/);
  }
  record = '{';
  assert.throws(() => getPendingBalanceAdjustment(1, 2), /恢复记录无法识别/);
});
