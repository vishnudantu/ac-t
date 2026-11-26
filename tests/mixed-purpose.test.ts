import { purposeBalances, availableForPurpose } from '@/lib/purpose-balances'
import { buildApprovalActionSchema } from '@/lib/lifecycle-rules'

const item = (preferredType: string, quantity: number, issued: number) => ({
  quantity, allocation: { request: { preferredType } }, issuances: [{ quantity: issued }],
})
const pool = {
  ticketPurpose: 'MIXED', complimentaryQuantity: 4, purchaseQuantity: 6, totalQuantity: 10,
  availableQuantity: 1, allocatedQuantity: 9, issuedQuantity: 4,
  allocations: [item('PURCHASE', 6, 2), item('COMPLIMENTARY', 3, 2)],
}

it('counts each commitment once after partial issuance and isolates each purpose', () => {
  expect(purposeBalances(pool)).toEqual({ complimentaryAvailable: 1, purchaseAvailable: 0, complimentaryIssued: 2, purchaseIssued: 2 })
  expect(availableForPurpose(pool, 'PURCHASE')).toBe(0)
})
it('keeps unattributed mixed movements out of new approvals', () => {
  expect(availableForPurpose({ ...pool, allocations: [] }, 'COMPLIMENTARY')).toBe(0)
})
it.each(['APPROVE', 'PARTIAL'])('requires remarks except for a versioned designated-user %s decision', action => {
  const input = { stepId: 'step', requestVersion: 1, action, items: [{ requestItemId: 'item', approvedQuantity: 2 }] }
  expect(buildApprovalActionSchema(true).safeParse(input).success).toBe(true)
  expect(buildApprovalActionSchema(false).safeParse(input).success).toBe(false)
  expect(buildApprovalActionSchema(true).safeParse({ ...input, requestVersion: undefined }).success).toBe(false)
})
