import pick from 'lodash/pick.js';
import { getBalanceLogModel } from './models.js';
import { formatMoney } from './money.js';

export function getPublicBalanceLog(log, username, operatorUsername) {
  return {
    ...pick(log, ['id', 'userId', 'operatorId', 'operationId', 'reason']),
    username,
    operatorUsername,
    changeAmount: formatMoney(log.changeAmount),
    balanceBefore: formatMoney(log.balanceBefore),
    balanceAfter: formatMoney(log.balanceAfter),
    createdAt: log.createdAt.toISOString(),
  };
}

export async function findBalanceLogs({ where, page, pageSize }) {
  const { rows, count } = await getBalanceLogModel().findAndCountAll({
    where,
    include: [
      { association: 'user', attributes: ['username'] },
      { association: 'operator', attributes: ['username'] },
    ],
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return {
    items: rows.map((log) => getPublicBalanceLog(log, log.user.username, log.operator.username)),
    pagination: { page, pageSize, total: count },
  };
}
