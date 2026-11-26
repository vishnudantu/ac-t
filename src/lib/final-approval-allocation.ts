import type { Prisma } from '@prisma/client'
import { LifecycleRuleError } from '@/lib/lifecycle-rules'

type AllocationRequest = Prisma.RequestGetPayload<{
  include: { items: { include: { ticketCategory: true } } }
}>

export async function allocateFinalApproval(
  tx: Prisma.TransactionClient,
  request: AllocationRequest,
  stepId: string,
  officerId: string,
  decisions: Array<{ requestItemId: string; approvedQuantity: number }>,
  totalQuantity: number,
) {
  if (request.totalAllocated || request.totalIssued || request.items.some((item) => item.allocatedQuantity || item.issuedQuantity)) {
    throw new LifecycleRuleError('Existing commitments require review before final approval', 409)
  }

  const requesterIds = [...new Set(request.items.map((item) => item.requesterId ?? request.requesterId))]
  const requesters = await tx.requester.findMany({
    where: { id: { in: requesterIds } },
    select: { id: true, organisation: { select: { quotaPool: { include: { quotaAllocations: true } } } } },
  })
  const requesterById = new Map(requesters.map((requester) => [requester.id, requester]))
  const pools = await tx.inventoryPool.findMany({
    where: { matchId: request.matchId, ticketCategoryId: { in: request.items.map((item) => item.ticketCategoryId) } },
    orderBy: [{ standName: 'asc' }, { blockName: 'asc' }, { id: 'asc' }],
  })
  const quantities = new Map(decisions.map((decision) => [decision.requestItemId, decision.approvedQuantity]))
  const available = new Map(pools.map((pool) => [pool.id, pool.availableQuantity]))
  const items: Prisma.AllocationItemUncheckedCreateWithoutAllocationInput[] = []
  const quotaUse = new Map<string, number>()
  const categoryQuotaUse = new Map<string, number>()
  const purpose = request.preferredType ?? 'COMPLIMENTARY'

  for (const item of [...request.items].sort((a, b) => a.id.localeCompare(b.id))) {
    const approved = quantities.get(item.id) ?? 0
    if (!approved) continue
    const category = item.ticketCategory
    if (!category.isActive || category.matchId !== request.matchId) {
      throw new LifecycleRuleError('Approval category must be active and belong to the request match', 409)
    }
    const requester = requesterById.get(item.requesterId ?? request.requesterId)
    if (!requester) throw new LifecycleRuleError('The ticket requester could not be found', 409)
    const linkedQuota = requester.organisation?.quotaPool
    const quota = purpose === 'COMPLIMENTARY' && linkedQuota?.matchId === request.matchId ? linkedQuota : undefined
    const categoryQuota = quota?.quotaAllocations.find((row) => row.ticketCategoryId === item.ticketCategoryId)
    const quotaRemaining = quota?.isActive && categoryQuota ? Math.max(0, Math.min(
      quota.totalAllocation - quota.consumedQuantity - (quotaUse.get(quota.id) ?? 0),
      categoryQuota.allocatedQuantity - categoryQuota.consumedQuantity - (categoryQuotaUse.get(categoryQuota.id) ?? 0),
    )) : 0
    const stand = item.preferredStand ?? request.preferredStand
    const eligible = pools.filter((pool) => pool.ticketCategoryId === item.ticketCategoryId
      && pool.ticketPurpose === purpose
      && (!stand || pool.standName === stand)
      && (!item.preferredBlock || pool.blockName === item.preferredBlock)
      && (pool.quotaPoolId ? pool.quotaPoolId === quota?.id : !pool.isQuotaPool))
      .sort((a, b) => Number(Boolean(b.quotaPoolId)) - Number(Boolean(a.quotaPoolId)))
    const poolRemaining = eligible.reduce((sum, pool) => sum + Math.max(0, available.get(pool.id) ?? 0), 0)
    const allocatable = quota ? Math.min(quotaRemaining, poolRemaining) : poolRemaining
    if (approved > allocatable) {
      const poolNames = eligible.map((pool) => [pool.standName, pool.blockName].filter(Boolean).join(' / ')).join(', ')
      const quotaMessage = quota ? ` Quota ${quota.displayName} remaining: ${quotaRemaining}.` : ''
      throw new LifecycleRuleError(
        `${category.displayName} (${poolNames || 'no eligible pools'}): requested ${item.requestedQuantity}, proposed ${approved}, available ${poolRemaining}, shortage ${approved - allocatable}.${quotaMessage}`,
        409,
      )
    }
    if (quota && categoryQuota) {
      quotaUse.set(quota.id, (quotaUse.get(quota.id) ?? 0) + approved)
      categoryQuotaUse.set(categoryQuota.id, (categoryQuotaUse.get(categoryQuota.id) ?? 0) + approved)
    }
    let remaining = approved
    for (const pool of eligible) {
      if (!remaining) break
      const balance = available.get(pool.id) ?? 0
      const quantity = Math.min(remaining, balance)
      if (quantity <= 0) continue
      available.set(pool.id, balance - quantity)
      remaining -= quantity
      items.push({
        requestItemId: item.id, inventoryPoolId: pool.id, ticketCategoryId: category.id,
        quantity, standName: pool.standName, blockName: pool.blockName,
        isFromQuota: Boolean(quota), quotaPoolId: quota?.id,
        status: 'CONFIRMED',
      })
    }
  }

  const confirmedAt = new Date()
  const allocation = await tx.allocation.create({ data: {
    allocationNumber: `AUTO-${stepId}`, matchId: request.matchId, requestId: request.id,
    officerId, confirmedBy: officerId, confirmedAt, status: 'CONFIRMED', totalQuantity,
    items: { create: items.map((item) => ({ ...item, confirmedAt })) },
  } })
  for (const pool of pools) {
    const next = available.get(pool.id) ?? pool.availableQuantity
    const quantity = pool.availableQuantity - next
    if (!quantity) continue
    const result = await tx.inventoryPool.updateMany({
      where: { id: pool.id, availableQuantity: pool.availableQuantity },
      data: { availableQuantity: { decrement: quantity }, allocatedQuantity: { increment: quantity } },
    })
    if (result.count !== 1) throw new LifecycleRuleError('Inventory changed; retry approval', 409)
    await tx.auditEvent.create({ data: {
      userId: officerId, matchId: request.matchId, entityType: 'INVENTORY', entityId: pool.id,
      action: 'AUTO_ALLOCATE', changedFields: ['availableQuantity', 'allocatedQuantity'],
      oldValues: JSON.stringify({ availableQuantity: pool.availableQuantity, allocatedQuantity: pool.allocatedQuantity }),
      newValues: JSON.stringify({
        requestId: request.id, allocationId: allocation.id, categoryId: pool.ticketCategoryId, quantity,
        availableQuantity: next, allocatedQuantity: pool.allocatedQuantity + quantity,
      }),
    } })
  }
  for (const [id, quantity] of quotaUse) {
    await tx.quotaPool.update({ where: { id }, data: { consumedQuantity: { increment: quantity } } })
  }
  for (const [id, quantity] of categoryQuotaUse) {
    await tx.quotaAllocation.update({ where: { id }, data: { consumedQuantity: { increment: quantity } } })
  }
  return allocation.id
}
