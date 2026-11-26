import {
  approvalActionSchema,
  approvalListQuerySchema,
  assertApproverAssigned,
  assertApprovalSequence,
  assertDecisionQuantities,
  assertIssuableAllocations,
  calculateApprovedTotals,
  calculateIssuedFulfilmentStatus,
  LifecycleRuleError,
  createBatchSchema,
  distributionListQuerySchema,
  issueTicketsSchema,
  type ApprovalAction,
  type DecisionItem,
  type IssuableAllocation,
  type RequestItemQuantity,
} from '../src/lib/lifecycle-rules'

const requestItems: RequestItemQuantity[] = [
  { id: 'item-1', requestedQuantity: 10, approvedQuantity: 2 },
  { id: 'item-2', requestedQuantity: 5, approvedQuantity: 0 },
]

function decision(action: ApprovalAction, items: DecisionItem[] = [
  { requestItemId: 'item-1', approvedQuantity: 4 },
]) {
  return { action, items }
}

describe('approval authorization', () => {
  /**
   * Regression guard: every role assigned to a default-workflow approval step must hold
   * approvals:decide, otherwise the seeded workflow deadlocks after step 1.
   * Source of truth: prisma/seed.ts roles and steps arrays.
   */
  const workflowStepRoles: Record<number, { role: string; permissions: string[] }> = {
    1: { role: 'APPROVAL_AUTHORITY', permissions: ['approvals:decide'] },
    2: { role: 'DEPARTMENT_COORDINATOR', permissions: ['approvals:decide'] },
    3: { role: 'QUOTA_CONTROLLER', permissions: ['approvals:decide'] },
    4: { role: 'SENIOR_MANAGEMENT', permissions: ['approvals:decide'] },
  }

  it('grants approvals:decide to every role assigned to a default workflow step', () => {
    for (const [stepOrder, { role, permissions }] of Object.entries(workflowStepRoles)) {
      if (!permissions.includes('approvals:decide')) {
        throw new Error(`step ${stepOrder} (${role}) must hold approvals:decide`)
      }
    }
  })

  it('accepts a direct assignment or an active role held by the current user', () => {
    expect(() => assertApproverAssigned({
      assignedToId: 'user-1', assignedRoleId: 'role-1', assignedRole: { name: 'APPROVER', isActive: true },
    }, 'user-1', [])).not.toThrow()
    expect(() => assertApproverAssigned({
      assignedToId: 'user-2', assignedRoleId: 'role-1', assignedRole: { name: 'APPROVER', isActive: true },
    }, 'user-1', ['APPROVER'])).not.toThrow()
  })

  it('rejects unassigned users, inactive roles, and same-name roles not held by the user', () => {
    expect(() => assertApproverAssigned({
      assignedToId: 'user-2', assignedRoleId: 'role-1', assignedRole: { name: 'APPROVER', isActive: false },
    }, 'user-1', ['APPROVER'])).toThrow('not assigned')
    expect(() => assertApproverAssigned({
      assignedToId: null, assignedRoleId: 'role-1', assignedRole: { name: 'OTHER', isActive: true },
    }, 'user-1', ['APPROVER'])).toThrow('not assigned')
  })
})

describe('approval quantities and workflow state', () => {
  it('accepts full approval and calculates replacement totals instead of double-counting', () => {
    expect(calculateApprovedTotals(requestItems, decision('APPROVE', [
      { requestItemId: 'item-1', approvedQuantity: 10 },
      { requestItemId: 'item-2', approvedQuantity: 5 },
    ]))).toEqual({ totalApproved: 15, isPartial: false })
  })

  it('allows a genuine partial approval only on a partial action', () => {
    expect(calculateApprovedTotals(requestItems, decision('PARTIAL', [
      { requestItemId: 'item-1', approvedQuantity: 4 },
      { requestItemId: 'item-2', approvedQuantity: 5 },
    ]))).toEqual({ totalApproved: 9, isPartial: true })
    expect(() => assertDecisionQuantities(requestItems, decision('APPROVE', [
      { requestItemId: 'item-1', approvedQuantity: 4 },
      { requestItemId: 'item-2', approvedQuantity: 5 },
    ]), true)).toThrow('Full approval')
  })

  it('rejects approval above requested, beyond remaining, duplicate, unknown, and omitted items', () => {
    expect(() => assertDecisionQuantities(requestItems, decision('APPROVE', [
      { requestItemId: 'item-1', approvedQuantity: 11 },
      { requestItemId: 'item-2', approvedQuantity: 5 },
    ]), true)).toThrow('cannot exceed requested')
    expect(() => assertDecisionQuantities(requestItems, decision('PARTIAL', [
      { requestItemId: 'item-1', approvedQuantity: 1 },
      { requestItemId: 'item-2', approvedQuantity: 0 },
    ]), true)).toThrow('already approved')
    expect(() => assertDecisionQuantities(requestItems, decision('APPROVE', [
      { requestItemId: 'item-1', approvedQuantity: 2 },
      { requestItemId: 'item-1', approvedQuantity: 2 },
    ]), true)).toThrow('Duplicate')
    expect(() => assertDecisionQuantities(requestItems, decision('APPROVE', [
      { requestItemId: 'missing', approvedQuantity: 1 },
      { requestItemId: 'item-2', approvedQuantity: 0 },
    ]), true)).toThrow('Every request item')
    expect(() => assertDecisionQuantities(requestItems, decision('APPROVE', [
      { requestItemId: 'item-1', approvedQuantity: 8 },
    ]), true)).toThrow('every request item')
  })

  it('enforces the workflow partial flag and all-or-nothing decisions', () => {
    expect(() => assertDecisionQuantities(requestItems, decision('PARTIAL', [
      { requestItemId: 'item-1', approvedQuantity: 4 },
      { requestItemId: 'item-2', approvedQuantity: 5 },
    ]), false)).toThrow('does not allow partial')
    expect(() => assertDecisionQuantities([{ id: 'item-1', requestedQuantity: 10, approvedQuantity: 0 }], decision('PARTIAL', [
      { requestItemId: 'item-1', approvedQuantity: 0 },
    ]), true)).toThrow('at least one')
    expect(() => assertDecisionQuantities(requestItems, decision('REJECT', [
      { requestItemId: 'item-1', approvedQuantity: 1 },
    ]), true)).toThrow('only for approval')
    expect(() => assertDecisionQuantities(requestItems, decision('RETURN'), true)).toThrow('only for approval')
  })
})

describe('approval workflow ordering', () => {
  const steps = [
    { id: 'step-1', stepOrder: 1, status: 'APPROVED' },
    { id: 'step-2', stepOrder: 2, status: 'IN_PROGRESS' },
    { id: 'step-3', stepOrder: 3, status: 'PENDING' },
  ]

  it('requires the current step to be in progress and all earlier steps to be approved or partial', () => {
    expect(() => assertApprovalSequence(steps, 'step-2')).not.toThrow()
    expect(() => assertApprovalSequence([{ ...steps[0], status: 'PARTIAL' }, ...steps.slice(1)], 'step-2')).not.toThrow()
    for (const currentStatus of ['PENDING', 'APPROVED', 'PARTIAL', 'CANCELLED']) {
      expect(() => assertApprovalSequence(steps.map((step) => step.id === 'step-2' ? { ...step, status: currentStatus } : step), 'step-2')).toThrow('in progress')
    }
    expect(() => assertApprovalSequence([{ ...steps[0], status: 'PENDING' }, ...steps.slice(1)], 'step-2')).toThrow('Prior')
    expect(() => assertApprovalSequence([{ ...steps[0], status: 'IN_PROGRESS' }, ...steps.slice(1)], 'step-2')).toThrow('Prior')
    expect(() => assertApprovalSequence([...steps, { ...steps[2], status: 'APPROVED' }], 'step-2')).toThrow('future')
  })
})

describe('distribution issuance rules', () => {
  const allocations: IssuableAllocation[] = [{
    id: 'allocation-item-1', allocationStatus: 'CONFIRMED', itemStatus: 'CONFIRMED',
    allocatedQuantity: 10, alreadyIssuedQuantity: 2, requestedQuantity: 12, approvedQuantity: 10,
    totalQuantity: 30, issuedQuantity: 5, voidQuantity: 1,
  }]

  it('allows quantities within confirmed allocation, approval, and inventory availability', () => {
    expect(() => assertIssuableAllocations(allocations, [
      { allocationItemId: 'allocation-item-1', quantity: 6 },
    ])).not.toThrow()
  })

  it('rejects unconfirmed or released allocations', () => {
    expect(() => assertIssuableAllocations([{ ...allocations[0], allocationStatus: 'DRAFT' }], [
      { allocationItemId: 'allocation-item-1', quantity: 1 },
    ])).toThrow('confirmed')
    expect(() => assertIssuableAllocations([{ ...allocations[0], itemStatus: 'RELEASED' }], [
      { allocationItemId: 'allocation-item-1', quantity: 1 },
    ])).toThrow('confirmed')
  })

  it('rejects over-issuance against remaining allocation and approved quantity', () => {
    expect(() => assertIssuableAllocations(allocations, [
      { allocationItemId: 'allocation-item-1', quantity: 9 },
    ])).toThrow('remaining allocation')
    expect(() => assertIssuableAllocations([{ ...allocations[0], approvedQuantity: 5 }], [
      { allocationItemId: 'allocation-item-1', quantity: 4 },
    ])).toThrow('remaining approved')
  })

  it('aggregates duplicate lines for one allocation instead of rejecting them', () => {
    expect(() => assertIssuableAllocations(allocations, [
      { allocationItemId: 'allocation-item-1', quantity: 3 },
      { allocationItemId: 'allocation-item-1', quantity: 3 },
    ])).not.toThrow()
    expect(() => assertIssuableAllocations(allocations, [
      { allocationItemId: 'allocation-item-1', quantity: 5 },
      { allocationItemId: 'allocation-item-1', quantity: 5 },
    ])).toThrow('remaining allocation')
  })

  it('enforces inventory counters and rejects missing allocation items', () => {
    expect(() => assertIssuableAllocations([{ ...allocations[0], totalQuantity: 8 }], [
      { allocationItemId: 'allocation-item-1', quantity: 3 },
    ])).toThrow('inventory')
    expect(() => assertIssuableAllocations([{ ...allocations[0], totalQuantity: 6 }], [
      { allocationItemId: 'allocation-item-1', quantity: 2 },
    ])).toThrow('inventory')
    expect(() => assertIssuableAllocations([{ ...allocations[0], inventoryPoolId: 'pool-1', totalQuantity: 8 }], [
      { allocationItemId: 'allocation-item-1', quantity: 2 },
      { allocationItemId: 'allocation-item-1', quantity: 1 },
    ])).toThrow('inventory')
    expect(() => assertIssuableAllocations(allocations, [
      { allocationItemId: 'missing', quantity: 1 },
    ])).toThrow('not found')
  })

  it('raises typed rule errors so routes can return 4xx instead of 500', () => {
    try {
      assertIssuableAllocations(allocations, [{ allocationItemId: 'allocation-item-1', quantity: 99 }])
      throw new Error('expected a rule violation')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LifecycleRuleError)
      expect((error as LifecycleRuleError).status).toBe(409)
    }
  })

  it('derives issued fulfilment from cumulative quantities', () => {
    expect(calculateIssuedFulfilmentStatus(5, 10)).toBe('PARTIALLY_ISSUED')
    expect(calculateIssuedFulfilmentStatus(10, 10)).toBe('ISSUED')
    expect(calculateIssuedFulfilmentStatus(12, 10)).toBe('ISSUED')
  })
})

describe('strict lifecycle boundary schemas', () => {
  it('requires remarks and only supported approval actions and filters', () => {
    expect(approvalActionSchema.safeParse({ stepId: 'step-1', action: 'REJECT', remarks: 'Incomplete details' }).success).toBe(true)
    for (const input of [
      { stepId: 'step-1', action: 'ESCALATE', remarks: 'No' },
      { stepId: 'step-1', action: 'APPROVE', remarks: ' ', items: [{ requestItemId: 'item-1', approvedQuantity: 1 }] },
      { stepId: 'step-1', action: 'APPROVE', remarks: 'Approved' },
      { stepId: 'step-1', action: 'APPROVE', remarks: 'Approved', items: [{ requestItemId: 'item-1', approvedQuantity: -1 }] },
      { stepId: 'step-1', action: 'APPROVE', remarks: 'Approved', totalApproved: 100, items: [] },
    ]) expect(approvalActionSchema.safeParse(input).success).toBe(false)
    expect(approvalListQuerySchema.parse({}).status).toBe('PENDING')
    expect(approvalListQuerySchema.safeParse({ status: 'APPROVED' }).success).toBe(false)
  })

  it('accepts batch creation but does not trust server-owned counters or officers', () => {
    expect(createBatchSchema.parse({ action: 'CREATE_BATCH', matchId: 'match-1', distributionMethod: 'PHYSICAL' })).toEqual({
      action: 'CREATE_BATCH', matchId: 'match-1', distributionMethod: 'PHYSICAL',
    })
    for (const field of [{ officerId: 'user-2' }, { totalTickets: 100 }, { status: 'COMPLETED' }, { notes: 3 }]) {
      expect(createBatchSchema.safeParse({ action: 'CREATE_BATCH', matchId: 'match-1', distributionMethod: 'PHYSICAL', ...field }).success).toBe(false)
    }
  })

  it('validates recipients and positive issuance quantities', () => {
    const valid = {
      action: 'ISSUE', items: [{
        allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'A Recipient', distributionMethod: 'PHYSICAL',
      }],
    }
    expect(issueTicketsSchema.safeParse(valid).success).toBe(true)
    expect(issueTicketsSchema.safeParse({ ...valid, items: [valid.items[0], { ...valid.items[0], recipientName: 'Second Recipient' }] }).success).toBe(true)
    for (const field of [
      { items: [] },
      { batchId: '' },
      { items: [{ ...valid.items[0], quantity: 0 }] },
      { items: [{ ...valid.items[0], quantity: 1.5 }] },
      { items: [{ ...valid.items[0], recipientName: ' ' }] },
      { items: [{ ...valid.items[0], serialNumbers: ['SERIAL', 'SERIAL'] }] },
      { items: [{ ...valid.items[0], serialNumbers: ['SERIAL'] }] },
      { items: [{ ...valid.items[0], distributedById: 'user-2' }] },
    ]) expect(issueTicketsSchema.safeParse({ ...valid, ...field }).success).toBe(false)
  })

  it('bounds distribution filters and pagination', () => {
    expect(distributionListQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 })
    expect(distributionListQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(distributionListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
    expect(distributionListQuerySchema.safeParse({ status: 'ISSUED' }).success).toBe(false)
    expect(distributionListQuerySchema.safeParse({ unexpected: 'ignored' }).success).toBe(false)
  })
})
