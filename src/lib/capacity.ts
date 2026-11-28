import type { Prisma } from '@prisma/client'

import { ApiError } from './api'

type Transaction = Prisma.TransactionClient

/**
 * Enforces the per-category capacity ceiling: the sum of every active quota
 * pool's allocated quantity for a category must not exceed the total inventory
 * available for that category in the match. Returns the available headroom or
 * throws a 409 with the offending category and remaining capacity.
 */
export async function assertQuotaCapacity(
  tx: Transaction,
  matchId: string,
  ticketCategoryId: string,
  additionalQuantity: number,
  excludeQuotaId?: string,
  categoryName = 'this category',
): Promise<void> {
  const [inventory, allocations] = await Promise.all([
    tx.inventoryPool.aggregate({ where: { matchId, ticketCategoryId }, _sum: { totalQuantity: true } }),
    tx.quotaAllocation.aggregate({
      where: {
        ticketCategoryId,
        quotaPool: { matchId, isActive: true, ...(excludeQuotaId ? { id: { not: excludeQuotaId } } : {}) },
      },
      _sum: { allocatedQuantity: true },
    }),
  ])
  const capacity = inventory._sum.totalQuantity ?? 0
  const committed = allocations._sum.allocatedQuantity ?? 0
  if (committed + additionalQuantity > capacity) {
    throw new ApiError(409, `Allocated quantity for ${categoryName} would exceed its inventory. Remaining capacity: ${Math.max(0, capacity - committed)}`)
  }
}
