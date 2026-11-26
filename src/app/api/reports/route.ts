import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { z } from 'zod'

const querySchema = z.object({ matchId: z.string().trim().min(1).optional() }).strict()

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'reports:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { matchId } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where = matchId ? { matchId } : {}
  const [requests, matches, inventory, quotas, allocations, issuances] = await Promise.all([
    prisma.request.aggregate({ where, _count: { _all: true }, _sum: { totalRequested: true, totalApproved: true, totalAllocated: true, totalIssued: true, totalDelivered: true } }),
    prisma.match.findMany({ select: { id: true, title: true, matchDate: true, status: true }, orderBy: { matchDate: 'desc' }, take: 100 }),
    prisma.inventoryPool.aggregate({ where, _sum: { totalQuantity: true, availableQuantity: true, allocatedQuantity: true, issuedQuantity: true } }),
    prisma.quotaPool.aggregate({ where, _sum: { totalAllocation: true, consumedQuantity: true } }),
    prisma.allocation.aggregate({ where, _count: { _all: true }, _sum: { totalQuantity: true } }),
    prisma.ticketIssuance.aggregate({ where, _count: { _all: true }, _sum: { quantity: true } }),
  ])
  const byCategory = await prisma.ticketCategory.findMany({
    where,
    select: {
      id: true, name: true, displayName: true,
      requestItems: { select: { requestedQuantity: true, approvedQuantity: true, allocatedQuantity: true, issuedQuantity: true } },
      inventoryPools: { select: { availableQuantity: true } },
    }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  const pools = await prisma.inventoryPool.findMany({
    where,
    select: { ticketPurpose: true, faceValue: true, issuedQuantity: true },
  })
  const setoff = await prisma.systemSetting.findUnique({ where: { key: 'pricing.complimentary_setoff_per_ticket' }, select: { value: true } })
  const setoffPerTicket = Number(setoff?.value || 499)
  const purposeBreakdown = pools.reduce((acc, pool) => {
    const purpose = pool.ticketPurpose === 'COMPLIMENTARY' || pool.ticketPurpose === 'PURCHASE'
      ? pool.ticketPurpose : 'UNCLASSIFIED'
    const bucket = acc[purpose] ?? { pools: 0, issued: 0, value: 0 }
    bucket.pools += 1
    bucket.issued += pool.issuedQuantity
    if (purpose === 'COMPLIMENTARY') bucket.value += setoffPerTicket * pool.issuedQuantity
    if (purpose === 'PURCHASE') bucket.value += Number(pool.faceValue ?? 0) * pool.issuedQuantity
    acc[purpose] = bucket
    return acc
  }, {} as Record<string, { pools: number; issued: number; value: number }>)
  return NextResponse.json({ success: true, matches, summary: {
    requests: requests._count._all,
    requested: requests._sum.totalRequested || 0,
    approved: requests._sum.totalApproved || 0,
    allocated: requests._sum.totalAllocated || 0,
    issued: requests._sum.totalIssued || 0,
    delivered: requests._sum.totalDelivered || 0,
    inventory: inventory._sum.totalQuantity || 0,
    available: inventory._sum.availableQuantity || 0,
    quotaAllocated: quotas._sum.totalAllocation || 0,
    quotaConsumed: quotas._sum.consumedQuantity || 0,
    allocationRecords: allocations._count._all,
    issuanceRecords: issuances._count._all,
    purposeBreakdown,
    complimentarySetoffPerTicket: setoffPerTicket,
  }, categories: byCategory.map((category) => ({
    id: category.id,
    name: category.displayName,
    requested: category.requestItems.reduce((sum, item) => sum + item.requestedQuantity, 0),
    approved: category.requestItems.reduce((sum, item) => sum + item.approvedQuantity, 0),
    allocated: category.requestItems.reduce((sum, item) => sum + item.allocatedQuantity, 0),
    issued: category.requestItems.reduce((sum, item) => sum + item.issuedQuantity, 0),
    available: category.inventoryPools.reduce((sum, pool) => sum + pool.availableQuantity, 0),
  })) })
})
