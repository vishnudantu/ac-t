import { purposeAllocations, purposeBalances } from '@/lib/purpose-balances'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission, type SessionPayload } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { inventoryCreateSchema, inventoryListQuerySchema } from '@/lib/validation'
import { apiError } from '@/lib/api-core'

export const GET = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'inventory:read')) return apiError('Forbidden', 403)
  const query = inventoryListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const search = query.search
  const where: Prisma.InventoryPoolWhereInput = {
    matchId: query.matchId,
    ticketCategoryId: query.categoryId,
    ...(search ? { OR: [
      { standName: { contains: search, mode: 'insensitive' } },
      { blockName: { contains: search, mode: 'insensitive' } },
      { gateName: { contains: search, mode: 'insensitive' } },
      { match: { title: { contains: search, mode: 'insensitive' } } },
    ] } : {}),
  }
  const [inventory, total, aggregate] = await prisma.$transaction([
    prisma.inventoryPool.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        ticketCategory: { select: { id: true, name: true, displayName: true, colorCode: true } },
        quotaPool: { select: { id: true, name: true, displayName: true } },
        allocations: purposeAllocations,
        _count: { select: { ticketSerials: true, allocations: true } },
      },
      orderBy: [{ matchId: 'asc' }, { ticketCategory: { sortOrder: 'asc' } }, { standName: 'asc' }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.inventoryPool.count({ where }),
    prisma.inventoryPool.aggregate({ where, _sum: {
      totalQuantity: true, reservedQuantity: true, availableQuantity: true,
      allocatedQuantity: true, issuedQuantity: true, returnedQuantity: true, voidQuantity: true,
    } }),
  ])
  return NextResponse.json({ success: true, inventory: inventory.map(({ allocations, ...pool }) => ({ ...pool, balances: purposeBalances({ ...pool, allocations }) })), total, summary: {
    total: aggregate._sum.totalQuantity || 0,
    reserved: aggregate._sum.reservedQuantity || 0,
    available: aggregate._sum.availableQuantity || 0,
    allocated: aggregate._sum.allocatedQuantity || 0,
    allocatedUnissued: Math.max(0, (aggregate._sum.allocatedQuantity ?? 0) - (aggregate._sum.issuedQuantity ?? 0)),
    issued: aggregate._sum.issuedQuantity || 0,
    returned: aggregate._sum.returnedQuantity || 0,
    void: aggregate._sum.voidQuantity || 0,
  } })
})

export const POST = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'inventory:write')) return apiError('Forbidden', 403)
  const data = inventoryCreateSchema.parse(await request.json())
  const inventory = await prisma.$transaction(async (tx) => {
    const category = await tx.ticketCategory.findUnique({ where: { id: data.ticketCategoryId }, select: { matchId: true, isActive: true } })
    if (!category || category.matchId !== data.matchId || !category.isActive) return apiError('Ticket category must be active and belong to the match', 422)
    if (data.quotaPoolId) {
      const quota = await tx.quotaPool.findUnique({ where: { id: data.quotaPoolId }, select: { matchId: true, isActive: true } })
      if (!quota || quota.matchId !== data.matchId || !quota.isActive) return apiError('Quota must be active and belong to the match', 422)
    }
    const created = await tx.inventoryPool.create({ data: {
      ...data,
      availableQuantity: data.totalQuantity,
      reservedQuantity: 0,
    }, include: { ticketCategory: true, match: true } })
    await tx.match.update({ where: { id: data.matchId }, data: { totalInventory: { increment: data.totalQuantity } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: data.matchId, entityType: 'INVENTORY', entityId: created.id,
      action: 'CREATE', newValues: JSON.stringify({ ticketCategoryId: data.ticketCategoryId, standName: data.standName, totalQuantity: data.totalQuantity }),
      changedFields: ['ticketCategoryId', 'standName', 'totalQuantity'],
    } })
    return created
  })
  return NextResponse.json({ success: true, inventory }, { status: 201 })
})
