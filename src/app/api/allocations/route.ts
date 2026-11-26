import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { generateAllocationNumber } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { hasPermission, type SessionPayload } from '@/lib/auth'
import { withApiHandler, ApiError } from '@/lib/api'
import { allocationCreateSchema, allocationListQuerySchema } from '@/lib/validation'
import { apiError } from '@/lib/api-core'

export const GET = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'allocations:read')) return apiError('Forbidden', 403)
  const query = allocationListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where: Prisma.AllocationWhereInput = {
    matchId: query.matchId, requestId: query.requestId,
    status: query.status && query.status !== 'all' ? query.status : undefined,
  }
  const [allocations, total] = await prisma.$transaction([
    prisma.allocation.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        request: { select: { id: true, requestNumber: true, totalIssued: true, requester: { select: { fullName: true } } } },
        officer: { select: { id: true, fullName: true } },
        items: { include: {
          ticketCategory: { select: { id: true, name: true, displayName: true } },
          inventoryPool: { select: { id: true, standName: true, blockName: true } },
          requestItem: { select: { requestedQuantity: true, approvedQuantity: true } },
        } },
      },
      orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset,
    }),
    prisma.allocation.count({ where }),
  ])
  return NextResponse.json({ success: true, allocations, total })
})

export const POST = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'allocations:write')) return apiError('Forbidden', 403)
  const data = allocationCreateSchema.parse(await request.json())
  try {
    const allocation = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.request.findUnique({ where: { id: data.requestId }, include: {
        requester: { include: { organisation: { include: { quotaPool: true } } } },
        items: { include: { requester: { include: { organisation: { include: { quotaPool: true } } } } } },
      } })
      if (!requestRecord || requestRecord.matchId !== data.matchId) throw new ApiError(422, 'Request must belong to the match')
      if (!['APPROVED', 'PARTIALLY_APPROVED'].includes(requestRecord.status)) throw new ApiError(409, 'Only approved requests can be allocated')
      if (requestRecord.items.length === 0) throw new ApiError(422, 'Request has no items to allocate')
      const requestItems = new Map(requestRecord.items.map((item) => [item.id, item]))
      const pools = await tx.inventoryPool.findMany({ where: { id: { in: data.items.map((item) => item.inventoryPoolId) } } })
      const poolById = new Map(pools.map((pool) => [pool.id, pool]))
      const itemQuantities = new Map<string, number>()
      const poolQuantities = new Map<string, number>()
      const quotaQuantities = new Map<string, number>()
      for (const item of data.items) {
        const requestItem = requestItems.get(item.requestItemId)
        const pool = poolById.get(item.inventoryPoolId)
        if (!requestItem || requestItem.ticketCategoryId !== item.ticketCategoryId) throw new ApiError(422, 'Request item category does not match the allocation')
        if (!pool || pool.matchId !== data.matchId || pool.ticketCategoryId !== item.ticketCategoryId) throw new ApiError(422, 'Inventory must belong to the match and category')
        const requester = requestItem.requester ?? requestRecord.requester
        const linkedQuota = requester.organisation?.quotaPool
        const purpose = requestRecord.preferredType ?? 'COMPLIMENTARY'
        const quotaId = purpose === 'COMPLIMENTARY' && linkedQuota?.matchId === data.matchId ? linkedQuota.id : null
        if ((item.quotaPoolId ?? null) !== quotaId
          || (pool.isQuotaPool && !pool.quotaPoolId)
          || (pool.quotaPoolId && pool.quotaPoolId !== quotaId)
          || pool.ticketPurpose !== purpose) {
          throw new ApiError(409, 'Inventory or quota is ineligible for this requester and ticket type')
        }
        itemQuantities.set(item.requestItemId, (itemQuantities.get(item.requestItemId) || 0) + item.quantity)
        poolQuantities.set(pool.id, (poolQuantities.get(pool.id) || 0) + item.quantity)
        if (item.isFromQuota && item.quotaPoolId) quotaQuantities.set(item.quotaPoolId, (quotaQuantities.get(item.quotaPoolId) || 0) + item.quantity)
      }
      for (const [id, quantity] of itemQuantities) {
        const item = requestItems.get(id)
        if (!item || quantity > item.approvedQuantity - item.allocatedQuantity) throw new ApiError(409, 'Allocation exceeds the remaining approved quantity')
      }
      for (const [id, quantity] of poolQuantities) {
        const pool = poolById.get(id)
        if (!pool || quantity > pool.availableQuantity) throw new ApiError(409, 'Allocation exceeds available inventory')
      }
      for (const [id, quantity] of quotaQuantities) {
        const quota = await tx.quotaPool.findUnique({ where: { id }, include: { quotaAllocations: true } })
        if (!quota || quota.matchId !== data.matchId || !quota.isActive) throw new ApiError(422, 'Quota must be active and belong to the match')
        if (quantity > quota.totalAllocation - quota.consumedQuantity) throw new ApiError(409, 'Allocation exceeds the remaining quota')
        const items = data.items.filter((item) => item.quotaPoolId === id)
        for (const categoryId of new Set(items.map((item) => item.ticketCategoryId))) {
          const category = quota.quotaAllocations.find((row) => row.ticketCategoryId === categoryId)
          if (!category) throw new ApiError(409, 'Quota does not permit this ticket category')
          const requested = items.filter((item) => item.ticketCategoryId === categoryId).reduce((sum, item) => sum + item.quantity, 0)
          if (requested > category.allocatedQuantity - category.consumedQuantity) throw new ApiError(409, 'Allocation exceeds the category quota')
        }
      }
      const allocationNumber = generateAllocationNumber()
      const created = await tx.allocation.create({ data: {
        allocationNumber, matchId: data.matchId, requestId: data.requestId,
        officerId: session.userId, totalQuantity: data.items.reduce((sum, item) => sum + item.quantity, 0),
        notes: data.notes, status: 'DRAFT',
        items: { create: data.items.map((item) => ({ ...item, status: 'RESERVED' })) },
      }, include: { items: { include: { ticketCategory: true, inventoryPool: true } } } })
      for (const [id, quantity] of itemQuantities) await tx.requestItem.update({ where: { id }, data: { allocatedQuantity: { increment: quantity } } })
      const totalAllocated = requestRecord.totalAllocated + created.totalQuantity
      await tx.request.update({ where: { id: data.requestId, version: requestRecord.version }, data: {
        totalAllocated, version: { increment: 1 },
        fulfilmentStatus: requestRecord.totalIssued ? requestRecord.fulfilmentStatus : totalAllocated === requestRecord.totalApproved ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
      } })
      for (const [id, quantity] of poolQuantities) {
        const reserved = await tx.inventoryPool.updateMany({ where: { id, availableQuantity: { gte: quantity } }, data: { availableQuantity: { decrement: quantity }, allocatedQuantity: { increment: quantity } } })
        if (reserved.count !== 1) throw new ApiError(409, 'Inventory changed; retry allocation')
      }
      for (const [id, quantity] of quotaQuantities) {
        await tx.quotaPool.update({ where: { id }, data: { consumedQuantity: { increment: quantity } } })
        const items = data.items.filter((item) => item.quotaPoolId === id)
        for (const categoryId of new Set(items.map((item) => item.ticketCategoryId))) {
          const quantity = items.filter((item) => item.ticketCategoryId === categoryId).reduce((sum, item) => sum + item.quantity, 0)
          await tx.quotaAllocation.update({ where: { quotaPoolId_ticketCategoryId: { quotaPoolId: id, ticketCategoryId: categoryId } }, data: { consumedQuantity: { increment: quantity } } })
        }
      }
      await tx.auditEvent.create({ data: {
        userId: session.userId, matchId: data.matchId, entityType: 'ALLOCATION', entityId: created.id,
        action: 'CREATE', newValues: JSON.stringify({ allocationNumber, totalQuantity: created.totalQuantity, status: 'DRAFT' }),
        changedFields: ['allocationNumber', 'totalQuantity', 'status'],
      } })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true, allocation }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(error.code)) {
      return apiError('Concurrent update detected; retry allocation', 409)
    }
    throw error
  }
})
