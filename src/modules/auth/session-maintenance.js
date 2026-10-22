import { Op } from 'sequelize';
import { z } from 'zod';
import { getSessionModel } from './models.js';

const cleanupSchema = z
  .object({
    batchSize: z.number().int().min(1).max(1000).default(500),
    maxBatches: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export async function deleteExpiredSessions(options = {}) {
  const { batchSize, maxBatches } = cleanupSchema.parse(options);
  const Session = getSessionModel();
  const expired = { expiresAt: { [Op.lte]: new Date() } };
  let deletedCount = 0;
  let batchCount = 0;

  while (batchCount < maxBatches) {
    const sessions = await Session.findAll({
      attributes: ['id'],
      where: expired,
      order: [
        ['expiresAt', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: batchSize,
      raw: true,
    });
    if (!sessions.length) return { deletedCount, batchCount, hasMore: false };

    // Recheck expiry on deletion; a concurrent renewal must not delete an active session.
    deletedCount += await Session.destroy({
      where: { ...expired, id: { [Op.in]: sessions.map(({ id }) => id) } },
    });
    batchCount += 1;
    if (sessions.length < batchSize) return { deletedCount, batchCount, hasMore: false };
  }

  const remaining = await Session.findOne({ attributes: ['id'], where: expired, raw: true });
  return { deletedCount, batchCount, hasMore: Boolean(remaining) };
}
