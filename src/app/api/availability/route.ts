import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

/**
 * Real-time per-category availability for a match: total capacity, allocated,
 * issued and remaining quantity. Used by request entry and the approval queue
 * so approvers never approve more than is available.
 */
export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, ['requests:read', 'approvals:read'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const matchId = z.string().trim().min(1).max(100).parse(request.nextUrl.searchParams.get('matchId'))
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, totalInventory: true, venue: { select: { id: true, name: true, capacity: true } } },
  })
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const categories = await prisma.ticketCategory.findMany({
    where: { matchId, isActive: true },
    select: {
      id: true, name: true, displayName: true, sortOrder: true,
      inventoryPools: { select: { totalQuantity: true, allocatedQuantity: true, issuedQuantity: true, voidQuantity: true } },
      requestItems: {
        where: { request: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED'] } } },
        select: { approvedQuantity: true, requestedQuantity: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })
  // Quota allocations cap how many tickets each stakeholder can draw per category.
  const quotaRows = await prisma.quotaAllocation.findMany({
    where: { quotaPool: { matchId, isActive: true } },
    select: { ticketCategoryId: true, allocatedQuantity: true, consumedQuantity: true },
  })
  const quotaByCategory = new Map<string, { allocated: number; consumed: number }>()
  for (const row of quotaRows) {
    const current = quotaByCategory.get(row.ticketCategoryId) ?? { allocated: 0, consumed: 0 }
    quotaByCategory.set(row.ticketCategoryId, { allocated: current.allocated + row.allocatedQuantity, consumed: current.consumed + row.consumedQuantity })
  }

  const rows = categories.map((category) => {
    const capacity = category.inventoryPools.reduce((sum, pool) => sum + pool.totalQuantity, 0)
    const allocated = category.inventoryPools.reduce((sum, pool) => sum + pool.allocatedQuantity + pool.issuedQuantity + pool.voidQuantity, 0)
    const approved = category.requestItems.reduce((sum, item) => sum + item.approvedQuantity, 0)
    const remaining = Math.max(0, capacity - allocated)
    const unallocatedApproved = Math.max(0, approved - allocated)
    return {
      id: category.id,
      name: category.name,
      displayName: category.displayName,
      capacity,
      allocated,
      approved,
      remaining,
      unallocatedApproved,
      issuable: Math.max(0, remaining - unallocatedApproved),
      quotaAllocated: quotaByCategory.get(category.id)?.allocated ?? 0,
      quotaConsumed: quotaByCategory.get(category.id)?.consumed ?? 0,
      quotaRemaining: Math.max(0, (quotaByCategory.get(category.id)?.allocated ?? 0) - (quotaByCategory.get(category.id)?.consumed ?? 0)),
    }
  })

  const totalCapacity = rows.reduce((sum, row) => sum + row.capacity, 0)
  const totalAllocated = rows.reduce((sum, row) => sum + row.allocated, 0)
  return NextResponse.json({
    success: true,
    categories: rows,
    summary: {
      venueId: match.venue.id,
      venueName: match.venue.name,
      venueCapacity: match.venue.capacity,
      totalInventory: match.totalInventory,
      totalCapacity,
      totalAllocated,
      totalRemaining: Math.max(0, totalCapacity - totalAllocated),
    },
  })
})
