import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api'
import { apiError } from '@/lib/api-core'
import { hasPermission } from '@/lib/auth'
import { LifecycleRuleError } from '@/lib/lifecycle-rules'
import { prisma } from '@/lib/prisma'

type Context = { params: Promise<{ id: string }> }
const cancellation = z.object({ reason: z.string().trim().min(1).max(2000) }).strict()

export const POST = withApiHandler<Context>(async (request, session, context) => {
  if (!hasPermission(session.permissions, 'allocations:confirm')) return apiError('Forbidden', 403)
  if (!context) return apiError('Allocation ID is required', 400)
  const { id } = await context.params
  const { reason } = cancellation.parse(await request.json())

  try {
    await prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({
        where: { id },
        include: { items: { include: { inventoryPool: true, requestItem: true, _count: { select: { issuances: true } } } }, request: true },
      })
      if (!allocation) throw new LifecycleRuleError('Allocation not found', 404)
      if (allocation.status === 'CANCELLED') return
      if (allocation.status !== 'CONFIRMED' || !allocation.allocationNumber.startsWith('AUTO-')
        || allocation.request.totalIssued || allocation.items.some((item) => item.status !== 'CONFIRMED' || item._count.issuances)) {
        throw new LifecycleRuleError('Only unissued automatic allocations can be cancelled here', 409)
      }
      const { request: record, items, matchId } = allocation
      if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(record.status) || record.totalAllocated !== allocation.totalQuantity) {
        throw new LifecycleRuleError('Request commitments require review before cancellation', 409)
      }
      await tx.request.update({
        where: { id: record.id, version: record.version },
        data: { status: 'CANCELLED', fulfilmentStatus: 'CANCELLED', totalAllocated: 0, closedAt: new Date(), version: { increment: 1 } },
      })
      await tx.allocation.update({ where: { id, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } })
      for (const item of items) {
        if (item.requestItem.allocatedQuantity < item.quantity) throw new LifecycleRuleError('Request item balance requires review', 409)
        await tx.requestItem.update({ where: { id: item.requestItemId, allocatedQuantity: { gte: item.quantity } }, data: { allocatedQuantity: { decrement: item.quantity } } })
        const pool = await tx.inventoryPool.update({
          where: { id: item.inventoryPoolId, allocatedQuantity: { gte: item.quantity } },
          data: { allocatedQuantity: { decrement: item.quantity }, availableQuantity: { increment: item.quantity } },
        })
        if (item.isFromQuota) {
          if (!item.quotaPoolId) throw new LifecycleRuleError('Original quota is missing', 409)
          await tx.quotaPool.update({ where: { id: item.quotaPoolId, consumedQuantity: { gte: item.quantity } }, data: { consumedQuantity: { decrement: item.quantity } } })
          await tx.quotaAllocation.update({
            where: { quotaPoolId_ticketCategoryId: { quotaPoolId: item.quotaPoolId, ticketCategoryId: item.ticketCategoryId }, consumedQuantity: { gte: item.quantity } },
            data: { consumedQuantity: { decrement: item.quantity } },
          })
        }
        await tx.auditEvent.create({ data: {
          userId: session.userId, matchId, entityType: 'INVENTORY', entityId: pool.id, action: 'ALLOCATION_CANCEL', reason,
          oldValues: JSON.stringify({ availableQuantity: pool.availableQuantity - item.quantity, allocatedQuantity: pool.allocatedQuantity + item.quantity }),
          newValues: JSON.stringify({ requestId: record.id, allocationId: id, quantity: item.quantity, availableQuantity: pool.availableQuantity, allocatedQuantity: pool.allocatedQuantity }),
          changedFields: ['availableQuantity', 'allocatedQuantity'],
        } })
      }
      await tx.allocationItem.updateMany({ where: { allocationId: id }, data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: reason } })
      await tx.auditEvent.create({ data: {
        userId: session.userId, matchId, entityType: 'ALLOCATION', entityId: id, action: 'CANCEL', reason,
        oldValues: JSON.stringify({ status: allocation.status }), newValues: JSON.stringify({ status: 'CANCELLED', requestId: record.id }),
        changedFields: ['status'],
      } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof LifecycleRuleError) return apiError(error.message, error.status)
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(error.code)) {
      return apiError('Allocation or balances changed. Refresh before retrying cancellation.', 409)
    }
    throw error
  }
})
