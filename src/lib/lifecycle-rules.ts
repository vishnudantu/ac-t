import { z } from 'zod'

const id = z.string().trim().min(1).max(200)
const optionalText = z.string().trim().max(2000).nullish()
const remarks = z.string().trim().min(1, 'Remarks are required').max(2000)
const approvedQuantity = z.number().int().min(0).max(1_000_000)
export class LifecycleRuleError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message)
    this.name = 'LifecycleRuleError'
  }
}

const issueQuantity = z.number().int().positive().max(1_000_000)

const listQuery = z.object({
  limit: z.string().regex(/^\d+$/).default('50').transform(Number).pipe(z.number().int().min(1).max(100)),
  offset: z.string().regex(/^\d+$/).default('0').transform(Number).pipe(z.number().int().min(0)),
})

export type ApprovalAction = 'APPROVE' | 'PARTIAL' | 'REJECT' | 'RETURN'

export interface DecisionItem {
  requestItemId: string
  approvedQuantity: number
}

export interface RequestItemQuantity {
  id: string
  requestedQuantity: number
  approvedQuantity: number
}

export interface ApprovalAssignment {
  assignedToId: string | null
  assignedRoleId: string | null
  assignedRole: { name: string; isActive: boolean } | null
}

export const MAX_REQUEST_ITEMS = 100

export interface IssuableAllocation {
  id: string
  inventoryPoolId?: string
  allocationStatus: string
  itemStatus: string
  allocatedQuantity: number
  alreadyIssuedQuantity: number
  requestedQuantity: number
  approvedQuantity: number
  availableQuantity: number
  totalQuantity: number
  issuedQuantity: number
  voidQuantity: number
}

export const approvalActionSchema = z.object({
  stepId: id,
  action: z.enum(['APPROVE', 'PARTIAL', 'REJECT', 'RETURN']),
  remarks,
  confidentialRemarks: optionalText,
  items: z.array(z.object({ requestItemId: id, approvedQuantity }).strict()).optional(),
}).strict().superRefine((input, context) => {
  if ((input.action === 'APPROVE' || input.action === 'PARTIAL') && !input.items?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'At least one approval item is required' })
  }
  if ((input.action === 'REJECT' || input.action === 'RETURN') && input.items !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Approved quantities are only for approval actions' })
  }
  if (input.items?.length && new Set(input.items.map((item) => item.requestItemId)).size !== input.items.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Duplicate request items are not allowed' })
  }
})

export const approvalListQuerySchema = listQuery.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'all']).default('PENDING'),
}).strict()

export const createBatchSchema = z.object({
  action: z.literal('CREATE_BATCH'),
  matchId: id,
  distributionMethod: z.enum(['PHYSICAL', 'DIGITAL', 'BOTH']),
  notes: optionalText,
}).strict()

const issueTicketsObjectSchema = z.object({
  action: z.literal('ISSUE'),
  batchId: id.optional(),
  distributionMethod: z.enum(['PHYSICAL', 'DIGITAL', 'BOTH']).optional(),
  notes: optionalText,
  items: z.array(z.object({
    allocationItemId: id,
    quantity: issueQuantity,
    distributionMethod: z.enum(['PHYSICAL', 'DIGITAL', 'BOTH']).optional(),
    recipientName: z.string().trim().min(1).max(500),
    recipientMobile: z.string().trim().min(5).max(30).nullish(),
    recipientIdType: z.string().trim().min(1).max(100).nullish(),
    recipientIdNumber: z.string().trim().min(1).max(200).nullish(),
    recipientSignature: z.string().trim().min(1).max(500).nullish(),
    acknowledgementRef: z.string().trim().min(1).max(200).nullish(),
    seatDetails: z.string().trim().min(1).max(2000).nullish(),
    serialNumbers: z.array(z.string().trim().min(1).max(200)).max(1_000_000).optional(),
    notes: optionalText,
  }).strict()).min(1).max(500),
})

export const issueTicketsSchema = issueTicketsObjectSchema.superRefine((input, context) => {
  for (const [index, item] of input.items.entries()) {
    if (item.serialNumbers) {
      if (new Set(item.serialNumbers).size !== item.serialNumbers.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'serialNumbers'], message: 'Serial numbers must be unique' })
      }
      if (item.serialNumbers.length !== item.quantity) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'serialNumbers'], message: 'Serial number count must equal quantity' })
      }
    }
  }
})

export const distributionActionSchema = z.discriminatedUnion('action', [createBatchSchema, issueTicketsObjectSchema]).superRefine((input, context) => {
  if (input.action !== 'ISSUE') return
  for (const [index, item] of input.items.entries()) {
    if (item.serialNumbers) {
      if (new Set(item.serialNumbers).size !== item.serialNumbers.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'serialNumbers'], message: 'Serial numbers must be unique' })
      }
      if (item.serialNumbers.length !== item.quantity) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'serialNumbers'], message: 'Serial number count must equal quantity' })
      }
    }
  }
})

export const distributionListQuerySchema = listQuery.extend({
  matchId: id.optional(),
  batchId: id.optional(),
  status: z.enum(['PREPARING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'all']).optional(),
}).strict()

export interface WorkflowStepState {
  id: string
  stepOrder: number
  status: string
}

/**
 * Approvals are strictly sequential: the current step must be IN_PROGRESS, every
 * earlier step must be APPROVED or PARTIAL, and no later step may already hold a
 * decision. This prevents out-of-order or future-step approvals.
 */
export function assertApprovalSequence(steps: WorkflowStepState[], stepId: string): void {
  const current = steps.find((step) => step.id === stepId)
  if (!current) throw new LifecycleRuleError('Approval step not found', 404)
  if (current.status !== 'IN_PROGRESS') {
    throw new LifecycleRuleError('Approval step is not in progress', 409)
  }
  const priorSteps = steps.filter((step) => step.stepOrder < current.stepOrder)
  if (priorSteps.some((step) => !['APPROVED', 'PARTIAL'].includes(step.status))) {
    throw new LifecycleRuleError('Prior approval steps must be approved before this decision', 409)
  }
  if (steps.some((step) => step.stepOrder > current.stepOrder && !['PENDING', 'CANCELLED'].includes(step.status))) {
    throw new LifecycleRuleError('A future approval step already holds a decision', 409)
  }
}

export function assertApproverAssigned(step: ApprovalAssignment, userId: string, roles: string[]): void {
  if (step.assignedToId === userId) return
  if (step.assignedRoleId && step.assignedRole?.isActive && roles.includes(step.assignedRole.name)) return
  throw new LifecycleRuleError('This approval step is not assigned to the current user', 403)
}

export function assertDecisionQuantities(
  requestItems: RequestItemQuantity[],
  input: { action: ApprovalAction; items?: DecisionItem[] },
  allowPartialApproval: boolean,
): void {
  if (input.action === 'REJECT' || input.action === 'RETURN') {
    if (input.items?.some((item) => item.approvedQuantity > 0)) {
      throw new LifecycleRuleError('Approved quantities are only for approval actions', 400)
    }
    return
  }

  if (!allowPartialApproval && input.action === 'PARTIAL') {
    throw new LifecycleRuleError('This approval step does not allow partial approval', 409)
  }
  if (!input.items?.length) throw new LifecycleRuleError('A decision is required for every request item', 400)

  const itemsById = new Map(requestItems.map((item) => [item.id, item]))
  const decisionIds = new Set<string>()
  for (const item of input.items) {
    if (decisionIds.has(item.requestItemId)) throw new LifecycleRuleError('Duplicate request items are not allowed', 400)
    decisionIds.add(item.requestItemId)
    const requestItem = itemsById.get(item.requestItemId)
    if (!requestItem) throw new LifecycleRuleError('Every request item must belong to the request', 400)
    if (item.approvedQuantity > requestItem.requestedQuantity) {
      throw new LifecycleRuleError('Approved quantity cannot exceed requested quantity', 400)
    }
    if (item.approvedQuantity < requestItem.approvedQuantity) {
      throw new LifecycleRuleError('Approved quantity cannot reduce quantities already approved', 409)
    }
  }
  if (input.items.length !== requestItems.length) throw new LifecycleRuleError('A decision is required for every request item', 400)

  const { totalApproved, isPartial } = calculateApprovedTotals(requestItems, input)
  if (input.action === 'PARTIAL' && totalApproved === 0) {
    throw new LifecycleRuleError('A partial approval must approve at least one quantity', 400)
  }
  if (input.action === 'APPROVE' && isPartial) throw new LifecycleRuleError('Full approval must approve every remaining requested quantity', 400)
  if (input.action === 'PARTIAL' && !isPartial) throw new LifecycleRuleError('A partial approval must leave at least one quantity unapproved', 400)
}

export function calculateApprovedTotals(
  requestItems: RequestItemQuantity[],
  input: { items?: DecisionItem[] },
): { totalApproved: number; isPartial: boolean } {
  const decisions = new Map(input.items?.map((item) => [item.requestItemId, item.approvedQuantity]))
  let totalApproved = 0
  let totalRequested = 0
  for (const item of requestItems) {
    totalRequested += item.requestedQuantity
    totalApproved += decisions.get(item.id) ?? item.approvedQuantity
  }
  return { totalApproved, isPartial: totalApproved < totalRequested }
}

export function calculateIssuedFulfilmentStatus(
  totalIssued: number,
  totalApproved: number,
): 'PARTIALLY_ISSUED' | 'ISSUED' {
  return totalIssued >= totalApproved ? 'ISSUED' : 'PARTIALLY_ISSUED'
}

/**
 * Validates a set of issuance lines against the allocation state. Duplicate
 * allocationItemId lines are intentionally supported (e.g. different recipients
 * drawing from one allocation) — the combined quantity must fit the remaining
 * budget.
 */
export function assertIssuableAllocations(
  allocations: IssuableAllocation[],
  items: Array<{ allocationItemId: string; quantity: number }>,
): void {
  const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]))
  const quantitiesByItemId = new Map<string, number>()
  for (const item of items) {
    if (item.quantity <= 0) throw new LifecycleRuleError('Issued quantity must be greater than zero', 400)
    quantitiesByItemId.set(item.allocationItemId, (quantitiesByItemId.get(item.allocationItemId) ?? 0) + item.quantity)
  }
  const inventoryQuantities = new Map<string, { requested: number; available: number }>()
  for (const [itemId, quantity] of quantitiesByItemId) {
    const allocation = allocationsById.get(itemId)
    if (!allocation) throw new LifecycleRuleError('Allocation item not found', 404)
    if (allocation.allocationStatus !== 'CONFIRMED' || !['CONFIRMED', 'ISSUED'].includes(allocation.itemStatus)) {
      throw new LifecycleRuleError('Only confirmed allocation items can be issued', 409)
    }
    if (quantity > allocation.allocatedQuantity - allocation.alreadyIssuedQuantity) {
      throw new LifecycleRuleError('Issued quantity cannot exceed the remaining allocation', 409)
    }
    if (quantity > allocation.approvedQuantity - allocation.alreadyIssuedQuantity) {
      throw new LifecycleRuleError('Issued quantity cannot exceed the remaining approved quantity', 409)
    }
    const poolId = allocation.inventoryPoolId ?? allocation.id
    const existing = inventoryQuantities.get(poolId) ?? {
      requested: 0,
      available: Math.min(allocation.availableQuantity, allocation.totalQuantity - allocation.issuedQuantity - allocation.voidQuantity),
    }
    inventoryQuantities.set(poolId, { ...existing, requested: existing.requested + quantity })
  }
  for (const { requested, available } of inventoryQuantities.values()) {
    if (requested > available) throw new LifecycleRuleError('Insufficient inventory availability', 409)
  }
}
