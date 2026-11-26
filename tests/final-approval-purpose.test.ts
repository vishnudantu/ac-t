import { allocateFinalApproval } from '@/lib/final-approval-allocation'

it('rejects Purchase stock for a Complimentary request and allocates all 25 after an explicit Purchase revision', async () => {
  const tx = {
    requester: { findMany: jest.fn().mockResolvedValue([{
      id: 'requester', organisation: { quotaPool: { id: 'complimentary-quota', matchId: 'match-1', quotaAllocations: [] } },
    }]) },
    inventoryPool: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'suite-5', ticketCategoryId: 'suite-category', ticketPurpose: 'PURCHASE',
        standName: 'Suite-5', blockName: 'Premium Hospitality', availableQuantity: 25, allocatedQuantity: 0,
        isQuotaPool: false, quotaPoolId: null,
      }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    allocation: { create: jest.fn().mockResolvedValue({ id: 'allocation' }) },
    quotaPool: { update: jest.fn() },
    quotaAllocation: { update: jest.fn() },
    auditEvent: { create: jest.fn() },
  }
  const allocate = (preferredType: string) => allocateFinalApproval(
    tx as unknown as Parameters<typeof allocateFinalApproval>[0],
    {
      id: 'request', matchId: 'match-1', requesterId: 'requester', preferredType,
      totalAllocated: 0, totalIssued: 0,
      items: [{
        id: 'request-line', requestedQuantity: 25, allocatedQuantity: 0, issuedQuantity: 0,
        ticketCategoryId: 'suite-category',
        ticketCategory: { id: 'suite-category', matchId: 'match-1', displayName: 'Suite-5', isActive: true },
      }],
    } as Parameters<typeof allocateFinalApproval>[1],
    'step', 'approver', [{ requestItemId: 'request-line', approvedQuantity: 25 }], 25,
  )

  await expect(allocate('COMPLIMENTARY')).rejects.toThrow(/no eligible complimentary pools/)
  expect(tx.allocation.create).not.toHaveBeenCalled()
  await expect(allocate('PURCHASE')).resolves.toBe('allocation')
  expect(tx.inventoryPool.updateMany).toHaveBeenCalledWith({
    where: { id: 'suite-5', availableQuantity: 25 },
    data: { availableQuantity: { decrement: 25 }, allocatedQuantity: { increment: 25 } },
  })
  expect(tx.quotaPool.update).not.toHaveBeenCalled()
  expect(tx.quotaAllocation.update).not.toHaveBeenCalled()
})
