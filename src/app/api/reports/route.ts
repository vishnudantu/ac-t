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
    }, take: 100, orderBy: { sortOrder: 'asc' },
  })
  // Purpose and pricing breakdown so GST set-off and purchase revenue are visible.
  const pools = await prisma.inventoryPool.findMany({
    where,
    select: { ticketPurpose: true, pricingUnit: true, faceValue: true, totalQuantity: true, issuedQuantity: true, complimentaryQuantity: true, purchaseQuantity: true },
  })
  const setoff = await prisma.systemSetting.findUnique({ where: { key: 'pricing.complimentary_setoff_per_ticket' }, select: { value: true } })
  const setoffPerTicket = Number(setoff?.value || 499)
  const purposeBreakdown = pools.reduce((acc, pool) => {
    const purpose = pool.ticketPurpose || 'COMPLIMENTARY'
    const faceValue = Number(pool.faceValue ?? (purpose === 'COMPLIMENTARY' ? setoffPerTicket : 0))
    // For mixed pools, split issued proportionally between the two sides using
    // the configured complimentary/purchase split, so the value reflects the real mix.
    const total = pool.totalQuantity || 1
    const compShare = purpose === 'MIXED' ? Math.min(1, pool.complimentaryQuantity / total) : (purpose === 'COMPLIMENTARY' ? 1 : 0)
    const purchShare = 1 - compShare
    if (purpose === 'MIXED') {
      const compIssued = Math.round(pool.issuedQuantity * compShare)
      const purchIssued = pool.issuedQuantity - compIssued
      const compBucket = acc.COMPLIMENTARY ?? { pools: 0, issued: 0, value: 0 }
      const purchBucket = acc.PURCHASE ?? { pools: 0, issued: 0, value: 0 }
      const mixedBucket = acc.MIXED ?? { pools: 0, issued: 0, value: 0 }
      acc.COMPLIMENTARY = { pools: compBucket.pools + 1, issued: compBucket.issued + compIssued, value: compBucket.value + faceValue * compIssued }
      acc.PURCHASE = { pools: purchBucket.pools + 1, issued: purchBucket.issued + purchIssued, value: purchBucket.value + faceValue * purchIssued }
      acc.MIXED = { pools: mixedBucket.pools + 1, issued: mixedBucket.issued + pool.issuedQuantity, value: mixedBucket.value + faceValue * pool.issuedQuantity }
    } else {
      const gross = faceValue * pool.issuedQuantity
      const bucket = acc[purpose] ?? { pools: 0, issued: 0, value: 0 }
      acc[purpose] = { pools: bucket.pools + 1, issued: bucket.issued + pool.issuedQuantity, value: bucket.value + gross }
    }
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
