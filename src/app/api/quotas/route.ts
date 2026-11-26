import { purposeAllocations, purposeBalances } from '@/lib/purpose-balances'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission, type SessionPayload } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { quotaCreateSchema, quotaListQuerySchema } from '@/lib/validation'
import { apiError } from '@/lib/api-core'
import { assertQuotaCapacity } from '@/lib/capacity'
import { inventoryPurposeTotals } from '@/lib/inventory-purpose'

export const GET = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'quotas:read')) return apiError('Forbidden', 403)
  const query = quotaListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where: Prisma.QuotaPoolWhereInput = { matchId: query.matchId }
  const [quotas, total, totals, pools] = await prisma.$transaction(async (tx) => Promise.all([
    tx.quotaPool.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        quotaAllocations: { include: { ticketCategory: { select: { id: true, name: true, displayName: true } } } },
        childQuotas: { select: { id: true, name: true, displayName: true } },
        _count: { select: { quotaTransfersFrom: true, quotaTransfersTo: true } },
      },
      orderBy: { name: 'asc' }, take: query.limit, skip: query.offset,
    }),
    tx.quotaPool.count({ where }),
    tx.quotaPool.aggregate({ where, _sum: { totalAllocation: true, consumedQuantity: true } }),
    hasPermission(session.permissions, 'inventory:read') ? tx.inventoryPool.findMany({
      where: { matchId: query.matchId },
      select: {
        allocations: purposeAllocations, availableQuantity: true, allocatedQuantity: true, issuedQuantity: true, ticketPurpose: true, totalQuantity: true, complimentaryQuantity: true, purchaseQuantity: true,
        ticketCategory: { select: { id: true, displayName: true } },
        match: { select: { title: true } },
      },
      orderBy: [{ match: { title: 'asc' } }, { ticketCategory: { displayName: 'asc' } }],
    }) : null,
  ]))
  const byCategory = new Map<string, {
    categoryId: string; category: string; match: string; complimentary: number; purchase: number; unclassified: number
    complimentaryAvailable: number; purchaseAvailable: number; complimentaryIssued: number; purchaseIssued: number
  }>()
  for (const pool of pools ?? []) {
    const id = pool.ticketCategory.id
    const current = byCategory.get(id) ?? {
      categoryId: id, category: pool.ticketCategory.displayName, match: pool.match.title,
      complimentary: 0, purchase: 0, unclassified: 0,
      complimentaryAvailable: 0, purchaseAvailable: 0, complimentaryIssued: 0, purchaseIssued: 0,
    }
    const split = inventoryPurposeTotals(pool)
    const balance = purposeBalances(pool)
    current.complimentaryAvailable += balance.complimentaryAvailable
    current.purchaseAvailable += balance.purchaseAvailable
    current.complimentaryIssued += balance.complimentaryIssued
    current.purchaseIssued += balance.purchaseIssued
    current.complimentary += split.complimentary
    current.purchase += split.purchase
    current.unclassified += split.unclassified
    byCategory.set(id, current)
  }
  return NextResponse.json({
    success: true, quotas, total,
    totals: { allocation: totals._sum.totalAllocation ?? 0, consumed: totals._sum.consumedQuantity ?? 0 },
    inventoryByCategory: pools ? [...byCategory.values()] : null,
  })
})

export const POST = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'quotas:write')) return apiError('Forbidden', 403)
  const data = quotaCreateSchema.parse(await request.json())
  const quota = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: data.matchId }, select: { id: true } })
    if (!match) return apiError('Match not found', 404)
    if (data.ownerId) {
      const owner = await tx.user.findUnique({ where: { id: data.ownerId }, select: { isActive: true } })
      if (!owner?.isActive) return apiError('Quota owner is not active', 422)
    }
    if (data.parentQuotaId) {
      const parent = await tx.quotaPool.findUnique({ where: { id: data.parentQuotaId }, select: { matchId: true, isActive: true } })
      if (!parent || parent.matchId !== data.matchId || !parent.isActive) return apiError('Parent quota must be active and belong to the match', 422)
    }
    const categories = await tx.ticketCategory.findMany({ where: { id: { in: data.allocations?.map((item) => item.ticketCategoryId) || [] } }, select: { matchId: true, isActive: true } })
    if (categories.length !== (data.allocations?.length || 0) || categories.some((category) => category.matchId !== data.matchId || !category.isActive)) {
      return apiError('Every quota category must be active and belong to the match', 422)
    }
    const totalAllocation = data.allocations?.reduce((sum, item) => sum + item.allocatedQuantity, 0) || 0
    for (const item of data.allocations || []) {
      await assertQuotaCapacity(tx, data.matchId, item.ticketCategoryId, item.allocatedQuantity)
    }
    const created = await tx.quotaPool.create({
      data: {
        matchId: data.matchId, name: data.name, displayName: data.displayName,
        description: data.description, ownerId: data.ownerId, parentQuotaId: data.parentQuotaId,
        totalAllocation,
        isActive: data.isActive,
        quotaAllocations: { create: data.allocations || [] },
      },
      include: { match: true, owner: true, quotaAllocations: { include: { ticketCategory: true } } },
    })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: data.matchId, entityType: 'QUOTA', entityId: created.id,
      action: 'CREATE', newValues: JSON.stringify({ name: data.name, totalAllocation }),
      changedFields: ['name', 'totalAllocation'],
    } })
    return created
  })
  return NextResponse.json({ success: true, quota }, { status: 201 })
})
