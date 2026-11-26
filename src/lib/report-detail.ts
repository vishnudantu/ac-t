import { purposeAllocations, purposeBalances } from '@/lib/purpose-balances'
import type { Prisma } from '@prisma/client'
import { inventoryPurposeTotals } from './inventory-purpose'

export const detailViews = ['pools', 'allocations', 'issuances'] as const
export type DetailView = typeof detailViews[number]
export interface DetailTable {
  headers: string[]
  rows: (string | number | null)[][]
}

export async function readReportDetail(tx: Prisma.TransactionClient, view: DetailView, matchId?: string): Promise<DetailTable> {
  if (view === 'pools') {
    const pools = await tx.inventoryPool.findMany({
      where: { matchId }, include: { allocations: purposeAllocations, match: { select: { title: true } }, ticketCategory: { select: { displayName: true } } },
      orderBy: [{ matchId: 'asc' }, { standName: 'asc' }, { id: 'asc' }],
    })
    return {
      headers: ['Match', 'Category', 'Stand', 'Block', 'Gate', 'Format', 'Pool purpose', 'Pricing unit', 'Face value (INR)', 'Total', 'Complimentary stock', 'Purchase stock', 'Unclassified stock', 'Available', 'Reserved', 'Allocated unissued', 'Issued', 'Returned', 'Void', 'Complimentary available', 'Purchase available', 'Complimentary issued', 'Purchase issued'],
      rows: pools.map(p => {
        const split = inventoryPurposeTotals(p)
        const balance = purposeBalances(p)
        return [p.match.title, p.ticketCategory.displayName, p.standName, p.blockName, p.gateName, p.ticketFormat,
          p.ticketPurpose, p.pricingUnit, p.faceValue === null ? null : Number(p.faceValue), p.totalQuantity,
          split.complimentary, split.purchase, split.unclassified, p.availableQuantity, p.reservedQuantity,
          p.allocatedQuantity - p.issuedQuantity, p.issuedQuantity, p.returnedQuantity, p.voidQuantity, balance.complimentaryAvailable, balance.purchaseAvailable, balance.complimentaryIssued, balance.purchaseIssued]
      }),
    }
  }
  if (view === 'allocations') {
    const items = await tx.allocationItem.findMany({
      where: { allocation: { matchId } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: { allocation: { select: { allocationNumber: true, match: { select: { title: true } }, request: { select: { requestNumber: true } } } },
        ticketCategory: { select: { displayName: true } }, issuances: { select: { quantity: true } } },
    })
    return {
      headers: ['Match', 'Request', 'Allocation', 'Category', 'Stand', 'Block', 'Item status', 'Allocation quantity', 'Recorded issuance quantity', 'From quota'],
      rows: items.map(i => [i.allocation.match.title, i.allocation.request.requestNumber, i.allocation.allocationNumber,
        i.ticketCategory.displayName, i.standName, i.blockName, i.status, i.quantity,
        i.issuances.reduce((sum, issuance) => sum + issuance.quantity, 0), i.isFromQuota ? 'Yes' : 'No']),
    }
  }
  const records = await tx.ticketIssuance.findMany({
    where: { matchId }, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
    select: { match: { select: { title: true } }, request: { select: { requestNumber: true } },
      allocationItem: { select: { allocation: { select: { allocationNumber: true } } } }, batch: { select: { batchNumber: true } },
      issuanceNumber: true, ticketCategory: true, standName: true, blockName: true, distributionMethod: true,
      quantity: true, issuedAt: true, deliveredAt: true, status: true, seatDetails: true, serialNumbers: true },
  })
  return {
    headers: ['Match', 'Request', 'Allocation', 'Issuance', 'Batch', 'Category', 'Stand', 'Block', 'Method', 'Quantity', 'Status', 'Issued (UTC)', 'Delivered (UTC)', 'Seats', 'Serial numbers'],
    rows: records.map(i => [i.match.title, i.request.requestNumber, i.allocationItem.allocation.allocationNumber,
      i.issuanceNumber, i.batch?.batchNumber ?? null, i.ticketCategory, i.standName, i.blockName, i.distributionMethod,
      i.quantity, i.status, i.issuedAt.toISOString(), i.deliveredAt?.toISOString() ?? null, i.seatDetails, i.serialNumbers.join(', ')]),
  }
}
