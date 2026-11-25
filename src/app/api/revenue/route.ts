import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
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

  const [pools, config] = await Promise.all([
    prisma.inventoryPool.findMany({
      where: matchId ? { matchId } : undefined,
      select: {
        ticketPurpose: true, pricingUnit: true, faceValue: true, totalQuantity: true,
        issuedQuantity: true, complimentaryQuantity: true, purchaseQuantity: true,
        ticketCategory: { select: { displayName: true } },
        match: { select: { id: true, title: true } },
      },
    }),
    getIntegrationConfig(),
  ])

  const nominalComplimentary = Number(configValue(config, 'pricing.complimentary_setoff_per_ticket') || 499)
  const gstRate = 0.18

  const rows = pools.map((pool) => {
    const faceValue = Number(pool.faceValue ?? 0)
    const issued = pool.issuedQuantity
    const purpose = pool.ticketPurpose || 'COMPLIMENTARY'

    if (purpose === 'MIXED') {
      const total = pool.totalQuantity || 1
      const compShare = Math.min(1, pool.complimentaryQuantity / total)
      const compIssued = Math.round(issued * compShare)
      const saleIssued = issued - compIssued
      const complimentaryRevenue = nominalComplimentary * compIssued
      const saleRevenue = faceValue * saleIssued
      return {
        purpose, matchTitle: pool.match.title, category: pool.ticketCategory.displayName,
        complimentaryIssued: compIssued, saleIssued,
        complimentaryRevenue, saleRevenue,
        gstOnComplimentary: complimentaryRevenue * gstRate / (1 + gstRate),
        gstOnSale: saleRevenue * gstRate / (1 + gstRate),
      }
    }

    const complimentaryIssued = purpose === 'COMPLIMENTARY' ? issued : 0
    const saleIssued = purpose === 'PURCHASE' ? issued : 0
    const complimentaryRevenue = nominalComplimentary * complimentaryIssued
    const saleRevenue = faceValue * saleIssued
    return {
      purpose, matchTitle: pool.match.title, category: pool.ticketCategory.displayName,
      complimentaryIssued, saleIssued,
      complimentaryRevenue, saleRevenue,
      gstOnComplimentary: complimentaryRevenue * gstRate / (1 + gstRate),
      gstOnSale: saleRevenue * gstRate / (1 + gstRate),
    }
  })

  const totals = rows.reduce((acc, row) => ({
    complimentaryIssued: acc.complimentaryIssued + row.complimentaryIssued,
    saleIssued: acc.saleIssued + row.saleIssued,
    complimentaryRevenue: acc.complimentaryRevenue + row.complimentaryRevenue,
    saleRevenue: acc.saleRevenue + row.saleRevenue,
    gstOnComplimentary: acc.gstOnComplimentary + row.gstOnComplimentary,
    gstOnSale: acc.gstOnSale + row.gstOnSale,
  }), { complimentaryIssued: 0, saleIssued: 0, complimentaryRevenue: 0, saleRevenue: 0, gstOnComplimentary: 0, gstOnSale: 0 })

  return NextResponse.json({
    success: true,
    gstRatePercent: 18,
    nominalComplimentaryPrice: nominalComplimentary,
    totals: {
      ...totals,
      totalIssued: totals.complimentaryIssued + totals.saleIssued,
      totalRevenue: totals.complimentaryRevenue + totals.saleRevenue,
      gstTotal: totals.gstOnComplimentary + totals.gstOnSale,
      netOfGst: (totals.complimentaryRevenue + totals.saleRevenue) - (totals.gstOnComplimentary + totals.gstOnSale),
    },
    rows,
  })
})
