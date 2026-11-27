import { inventoryPurposeTotals } from '@/lib/inventory-purpose'
import { purposeBalances } from '@/lib/purpose-balances'
import { readReportDetail } from '@/lib/report-detail'

const stand = {
  match: { title: 'Match' }, ticketCategory: { displayName: 'C Stand' }, standName: 'C Stand',
  ticketPurpose: 'MIXED', totalQuantity: 1706, complimentaryQuantity: 500, purchaseQuantity: 1187,
  availableQuantity: 1706, allocatedQuantity: 0, issuedQuantity: 0,
}

it('retains the declared split and isolates the 19 unclassified tickets in the pool report', async () => {
  const tx = { inventoryPool: { findMany: async () => [stand] } } as unknown as Parameters<typeof readReportDetail>[0]
  const detail = await readReportDetail(tx, 'pools')
  const row = Object.fromEntries(detail.headers.map((column, i) => [column, detail.rows[0][i]]))
  expect(row).toMatchObject({ Total: 1706, 'Complimentary stock': 500, 'Purchase stock': 1187,
    'Unclassified stock': 19, Available: 1706, 'Complimentary available': 500, 'Purchase available': 1187 })
})

it('keeps the remainder unavailable to either purpose after all classified stock is committed', () => {
  const committed = { ...stand, availableQuantity: 19, allocatedQuantity: 1687, allocations:
    [['COMPLIMENTARY', 500], ['PURCHASE', 1187]].map(([type, quantity]) => ({
      quantity: Number(quantity), allocation: { request: { preferredType: String(type) } }, issuances: [],
    })) }
  expect(purposeBalances(committed)).toMatchObject({ complimentaryAvailable: 0, purchaseAvailable: 0 })
  expect(inventoryPurposeTotals(committed).unclassified).toBe(19)
})

it.each([[600, 1187], [-1, 1187]])('keeps invalid splits conservative (%i and %i)', (complimentaryQuantity, purchaseQuantity) => {
  const invalid = { ...stand, complimentaryQuantity, purchaseQuantity }
  expect(inventoryPurposeTotals(invalid)).toEqual({ complimentary: 0, purchase: 0, unclassified: 1706 })
  expect(purposeBalances(invalid)).toMatchObject({ complimentaryAvailable: 0, purchaseAvailable: 0 })
})
