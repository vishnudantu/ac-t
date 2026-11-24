import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission, type SessionPayload } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { apiError } from '@/lib/api-core'
import { LifecycleRuleError } from '@/lib/lifecycle-rules'

type Transaction = Prisma.TransactionClient

interface RouteContext {
  params: Promise<{ id: string }>
}

export const POST = withApiHandler<RouteContext>(async (
  _request: NextRequest,
  session: SessionPayload,
  context?: RouteContext,
): Promise<NextResponse> => {
  if (!hasPermission(session.permissions, 'allocations:confirm')) return apiError('Forbidden', 403)
  if (!context) return apiError('Allocation ID is required', 400)
  const { id } = await context.params
  if (!id || typeof id !== 'string') return apiError('Invalid allocation ID', 400)

  try {
    const allocation = await prisma.$transaction(async (tx: Transaction) => {
      const record = await tx.allocation.findUnique({ where: { id }, include: { items: true } })
      if (!record) throw new LifecycleRuleError('Allocation not found', 404)
      if (record.status !== 'DRAFT') throw new LifecycleRuleError('Only draft allocations can be confirmed', 409)
      if (!record.items.length || record.items.some((item) => item.status !== 'RESERVED')) {
        throw new LifecycleRuleError('All allocation items must be reserved before confirmation', 409)
      }
      const claimed = await tx.allocation.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'CONFIRMED', confirmedBy: session.userId, confirmedAt: new Date() },
      })
      if (claimed.count !== 1) throw new LifecycleRuleError('Allocation changed; retry confirmation', 409)
      const itemUpdate = await tx.allocationItem.updateMany({
        where: { allocationId: id, status: 'RESERVED' },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      })
      if (itemUpdate.count !== record.items.length) {
        throw new LifecycleRuleError('Allocation items changed during confirmation; retry', 409)
      }
      await tx.auditEvent.create({ data: {
        userId: session.userId,
        matchId: record.matchId,
        entityType: 'ALLOCATION',
        entityId: id,
        action: 'CONFIRM',
        oldValues: JSON.stringify({ status: 'DRAFT', itemStatuses: record.items.map((item) => ({ id: item.id, status: item.status })) }),
        newValues: JSON.stringify({ status: 'CONFIRMED', confirmedBy: session.userId }),
        changedFields: ['status', 'confirmedBy'],
      } })
      return { id, status: 'CONFIRMED' }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true, allocation })
  } catch (error: unknown) {
    if (error instanceof LifecycleRuleError) return apiError(error.message, error.status)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return apiError('Concurrent update detected; retry the request', 409)
    }
    throw error
  }
})
