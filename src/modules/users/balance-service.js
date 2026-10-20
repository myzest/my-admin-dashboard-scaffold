import pick from 'lodash/pick.js';
import { Transaction } from 'sequelize';
import { getDatabase } from '../../server/database.js';
import { HttpError } from '../../server/errors.js';
import { getBalanceLogModel, getUserModel } from './models.js';
import { calculateBalance, formatMoney } from './money.js';
import { balanceChangeSchema, balanceLogQuerySchema } from './schema.js';

function getPublicBalanceLog(log, username, operatorUsername) {
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

export async function changeUserBalance(userId, input, operatorId) {
  const { direction, amount, reason, operationId } = balanceChangeSchema.parse(input);
  const changeAmount = `${direction === 'decrease' ? '-' : ''}${formatMoney(amount)}`;

  return getDatabase().transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const operator = await getUserModel().findOne({
        where: { id: operatorId, role: 'admin' },
        attributes: ['id', 'username'],
        transaction,
      });
      if (!operator) throw new HttpError(403, 'FORBIDDEN', '只有管理员可以调整余额');

      const user = await getUserModel().findOne({
        where: { id: userId, role: 'user' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');

      const BalanceLog = getBalanceLogModel();
      // The user lock serializes its balance writes. READ COMMITTED sees the preceding log
      // without gap-locking missing operation IDs belonging to concurrent users.
      const previousLog = await BalanceLog.findOne({
        where: { userId, operationId },
        transaction,
      });
      if (previousLog) {
        if (
          previousLog.operatorId !== operator.id ||
          formatMoney(previousLog.changeAmount) !== changeAmount ||
          previousLog.reason !== reason
        ) {
          throw new HttpError(409, 'OPERATION_CONFLICT', '操作编号已用于不同的余额调整');
        }
        return getPublicBalanceLog(previousLog, user.username, operator.username);
      }

      const balanceBefore = formatMoney(user.balance);
      const balanceAfter = calculateBalance(balanceBefore, direction, amount);
      await user.update({ balance: balanceAfter }, { transaction });
      const log = await BalanceLog.create(
        {
          userId,
          operatorId: operator.id,
          operationId,
          changeAmount,
          balanceBefore,
          balanceAfter,
          reason,
        },
        { transaction },
      );
      return getPublicBalanceLog(log, user.username, operator.username);
    },
  );
}

export async function listBalanceLogs(query) {
  const { page, pageSize, userId } = balanceLogQuerySchema.parse(query);
  const { rows, count } = await getBalanceLogModel().findAndCountAll({
    where: userId ? { userId } : {},
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
