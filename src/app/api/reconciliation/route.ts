import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { z } from 'zod'

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'reports:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const matchId = z.string().trim().min(1).max(100).optional().parse(request.nextUrl.searchParams.get('matchId') || undefined)

  const matches = await prisma.match.findMany({
    where: matchId ? { id: matchId } : undefined,
    include: {
      venue: { select: { name: true, city: true, capacity: true } },
      requests: {
        select: { id: true, status: true, totalRequested: true, totalApproved: true, totalAllocated: true, totalIssued: true, fulfilmentStatus: true },
      },
      inventoryPools: {
        select: { id: true, ticketCategoryId: true, totalQuantity: true, availableQuantity: true, allocatedQuantity: true, issuedQuantity: true, returnedQuantity: true, voidQuantity: true, ticketCategory: { select: { name: true, displayName: true } } },
      },
      quotaPools: { select: { id: true, totalAllocation: true, consumedQuantity: true } },
    },
    orderBy: { matchDate: 'desc' },
    take: 20,
  })

  const rows = matches.map((match) => {
    const totals = match.requests.reduce((result, request) => ({
      requested: result.requested + request.totalRequested,
      approved: result.approved + request.totalApproved,
      allocated: result.allocated + request.totalAllocated,
      issued: result.issued + request.totalIssued,
    }), { requested: 0, approved: 0, allocated: 0, issued: 0 })
    const inventory = match.inventoryPools.reduce((result, pool) => ({
      total: result.total + pool.totalQuantity,
      available: result.available + pool.availableQuantity,
      allocated: result.allocated + pool.allocatedQuantity,
      issued: result.issued + pool.issuedQuantity,
      returned: result.returned + pool.returnedQuantity,
      void: result.void + pool.voidQuantity,
    }), { total: 0, available: 0, allocated: 0, issued: 0, returned: 0, void: 0 })
    const quota = match.quotaPools.reduce((result, pool) => ({
      allocated: result.allocated + pool.totalAllocation,
      consumed: result.consumed + pool.consumedQuantity,
    }), { allocated: 0, consumed: 0 })
    const requestsByStatus = match.requests.reduce((result: Record<string, number>, request) => {
      result[request.status] = (result[request.status] || 0) + 1
      return result
    }, {})
    const reconciliation = {
      unapproved: totals.requested - totals.approved,
      unallocated: totals.approved - totals.allocated,
      unissued: totals.allocated - totals.issued,
      remainingStock: inventory.total - inventory.issued - inventory.void,
    }
    return {
      id: match.id, title: match.title, matchDate: match.matchDate,
      venue: match.venue.name, venueCapacity: match.venue.capacity, status: match.status,
      totals, inventory, quota, requestsByStatus, reconciliation,
    }
  })

  return NextResponse.json({ success: true, matches: rows })
})
