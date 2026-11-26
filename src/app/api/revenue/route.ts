import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { purchaseIssueValue } from '@/lib/issued-value'
import { getIntegrationConfig, configValue } from '@/lib/integrations'

/**
 * Real-time revenue view of ticket sales and complimentary allocations.
 * Face values are GST-inclusive at 18%. Complimentary tickets carry ACA's
 * configured nominal price (default ₹499) rather than the actual face value —
 * ACA absorbs the GST on that nominal price, so a high-value complimentary
 * ticket does not transfer a large GST burden to the association.
 */
export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'reports:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const matchId = request.nextUrl.searchParams.get('matchId') || undefined

  const [pools, config, matches] = await Promise.all([
    prisma.inventoryPool.findMany({
      where: matchId ? { matchId } : undefined,
      select: {
        ticketPurpose: true, pricingUnit: true, totalQuantity: true, faceValue: true, issuedQuantity: true,
        ticketCategory: { select: { displayName: true } },
        match: { select: { id: true, title: true } },
      },
    }),
    getIntegrationConfig(),
    prisma.match.findMany({ select: { id: true, title: true }, orderBy: { matchDate: "desc" } }),
  ])
  // Approved-but-not-yet-issued pipeline: value still in approval→issuance flow.
  const pipeline = await prisma.requestItem.aggregate({
    where: {
      request: { status: { in: ['APPROVED', 'PARTIALLY_APPROVED'] }, ...(matchId ? { matchId } : {}) },
      approvedQuantity: { gt: 0 },
    },
    _sum: { approvedQuantity: true, allocatedQuantity: true, issuedQuantity: true },
  })

  const nominalComplimentary = Number(configValue(config, 'pricing.complimentary_setoff_per_ticket') || 499)
  const gstRate = 0.18

  const rows = pools.map((pool) => {
    const issued = pool.issuedQuantity
    const purpose = pool.ticketPurpose
    const unclassifiedIssued = purpose === 'COMPLIMENTARY' || purpose === 'PURCHASE' ? 0 : issued
    const complimentaryIssued = purpose === 'COMPLIMENTARY' ? issued : 0
    const saleIssued = purpose === 'PURCHASE' ? issued : 0
    const complimentaryRevenue = nominalComplimentary * complimentaryIssued
    const saleRevenue = purpose === 'PURCHASE' ? purchaseIssueValue(pool) : 0
    return {
      purpose, matchTitle: pool.match.title, category: pool.ticketCategory.displayName,
      complimentaryIssued, saleIssued, unclassifiedIssued,
      complimentaryRevenue, saleRevenue,
      gstOnComplimentary: complimentaryRevenue * gstRate / (1 + gstRate),
      gstOnSale: (saleRevenue ?? 0) * gstRate / (1 + gstRate),
    }
  })

  const totals = rows.reduce((acc, row) => ({
    complimentaryIssued: acc.complimentaryIssued + row.complimentaryIssued,
    saleIssued: acc.saleIssued + row.saleIssued,
    unclassifiedIssued: acc.unclassifiedIssued + row.unclassifiedIssued,
    complimentaryRevenue: acc.complimentaryRevenue + row.complimentaryRevenue,
    saleRevenue: acc.saleRevenue + (row.saleRevenue ?? 0),
    gstOnComplimentary: acc.gstOnComplimentary + row.gstOnComplimentary,
    gstOnSale: acc.gstOnSale + row.gstOnSale,
  }), { complimentaryIssued: 0, saleIssued: 0, unclassifiedIssued: 0, complimentaryRevenue: 0, saleRevenue: 0, gstOnComplimentary: 0, gstOnSale: 0 })

  return NextResponse.json({
    success: true,
    gstRatePercent: 18,
    nominalComplimentaryPrice: nominalComplimentary,
    totals: {
      ...totals,
      totalIssued: totals.complimentaryIssued + totals.saleIssued + totals.unclassifiedIssued,
      unvaluedPurchaseTickets: rows.reduce((n, row) => n + (row.saleRevenue === null ? row.saleIssued : 0), 0),
      totalRevenue: totals.complimentaryRevenue + totals.saleRevenue,
      gstTotal: totals.gstOnComplimentary + totals.gstOnSale,
      netOfGst: (totals.complimentaryRevenue + totals.saleRevenue) - (totals.gstOnComplimentary + totals.gstOnSale),
      // Approved-not-yet-issued pipeline so the page is meaningful before issuance.
      pendingApproved: (pipeline._sum.approvedQuantity ?? 0) - (pipeline._sum.issuedQuantity ?? 0),
      pendingAllocated: Math.max(0, (pipeline._sum.allocatedQuantity ?? 0) - (pipeline._sum.issuedQuantity ?? 0)),
    },
    rows,
    matches,
  })
})
