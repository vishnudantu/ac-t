import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { getSession, hasPermission, hasRole, type SessionPayload } from '@/lib/auth'
import { sendNotification } from '@/lib/notifications'
import {
  approvalActionSchema,
  approvalListQuerySchema,
  assertApprovalSequence,
  assertApproverAssigned,
  assertDecisionQuantities,
  calculateApprovedTotals,
  LifecycleRuleError,
} from '@/lib/lifecycle-rules'
import { prisma } from '@/lib/prisma'

type Transaction = Prisma.TransactionClient
type ApprovalInput = z.infer<typeof approvalActionSchema>
type ApprovalStep = Prisma.ApprovalStepGetPayload<{
  include: {
    assignedRole: true
    stepDefinition: true
    workflow: true
    request: { include: { items: true; approvalSteps: true } }
  }
}>
type RoleClient = Pick<Prisma.TransactionClient, 'roleAssignment'>

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session) return responseError('Unauthorized', 401)
    if (!hasPermission(session.permissions, 'approvals:read')) return responseError('Forbidden', 403)
    const query = approvalListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const roleIds = await activeRoleIds(prisma, session.userId)
    // Super admins and escalation authorities oversee every pending step, not
    // only steps assigned to their own role — otherwise the auto-provisioned
    // APPROVAL_AUTHORITY steps are invisible to the seeded super admin.
    const overseeAll = hasRole(session.roles, 'SUPER_ADMIN') || hasPermission(session.permissions, 'approvals:escalate')
    const where = approvalWhere(session.userId, roleIds, query.status, overseeAll)
    const [steps, total] = await prisma.$transaction([
      prisma.approvalStep.findMany({
        where,
        include: {
          assignedRole: { select: { id: true, name: true, displayName: true } },
          assignedTo: { select: { id: true, fullName: true } },
          request: { include: {
            items: true,
            requester: { select: { id: true, fullName: true, mobileNumber: true } },
            match: { select: { id: true, title: true, matchDate: true } },
          } },
          stepDefinition: { select: { allowPartialApproval: true, allowReturnForClarification: true } },
        },
        orderBy: [{ deadlineAt: 'asc' }, { createdAt: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.approvalStep.count({ where }),
    ])
    return NextResponse.json({ success: true, steps, total })
  } catch (error: unknown) {
    return handleError(error, 'Failed to list approval steps')
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session) return responseError('Unauthorized', 401)
    if (!hasPermission(session.permissions, 'approvals:decide')) return responseError('Forbidden', 403)
    const input = approvalActionSchema.parse(await request.json())
    const result = await prisma.$transaction(async (tx) => {
      const roleIds = await activeRoleIds(tx, session.userId)
      const overseeAll = hasRole(session.roles, 'SUPER_ADMIN') || hasPermission(session.permissions, 'approvals:escalate')
      const step = overseeAll
        ? await tx.approvalStep.findUnique({ where: { id: input.stepId }, include: {
          assignedRole: true, stepDefinition: true, workflow: true,
          request: { include: { items: true, approvalSteps: true } },
        } }).then((step) => {
          if (!step) throw new LifecycleRuleError('Approval step not found', 404)
          return step
        })
        : await findAssignedStep(tx, input.stepId, session.userId, roleIds)
      if (!overseeAll) assertApproverAssigned(step, session.userId, session.roles)
      if (!step.stepDefinition.isActive || !step.workflow.isActive) {
        throw new LifecycleRuleError('Approval workflow is inactive', 409)
      }
      assertApprovalSequence(step.request.approvalSteps, step.id)
      if (input.action === 'RETURN' && !step.stepDefinition.allowReturnForClarification) {
        throw new LifecycleRuleError('This step does not allow return for clarification', 409)
      }
      assertDecisionQuantities(step.request.items, input, step.stepDefinition.allowPartialApproval)
      await claimStepAndRequest(tx, step, input.action)
      return input.action === 'APPROVE' || input.action === 'PARTIAL'
        ? approveStep(tx, step, input, session)
        : closeRequest(tx, step, input, session)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    // Fire-and-forget requester notification; delivery is logged, never blocks the decision.
    void notifyDecision(result.requestStatus, input.stepId).catch(() => undefined)
    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    return handleError(error, 'Failed to record approval decision')
  }
}

function approvalWhere(userId: string, roleIds: string[], status: 'PENDING' | 'IN_PROGRESS' | 'all', overseeAll = false): Prisma.ApprovalStepWhereInput {
  return {
    status: status === 'all' ? undefined : (status === 'PENDING' ? { in: ['PENDING', 'IN_PROGRESS'] } : status),
    ...(overseeAll ? {} : { OR: [
      { assignedToId: userId },
      ...(roleIds.length ? [{ assignedRoleId: { in: roleIds }, assignedRole: { isActive: true } }] : []),
    ] }),
  }
}

function findAssignedStep(tx: Transaction, stepId: string, userId: string, roleIds: string[]): Promise<ApprovalStep> {
  return tx.approvalStep.findFirst({
    where: { id: stepId, ...approvalWhere(userId, roleIds, 'all') },
    include: {
      assignedRole: true,
      stepDefinition: true,
      workflow: true,
      request: { include: { items: true, approvalSteps: true } },
    },
  }).then((step) => {
    if (!step) throw new LifecycleRuleError('Approval step not found or not assigned', 404)
    return step
  })
}

async function claimStepAndRequest(tx: Transaction, step: ApprovalStep, action: ApprovalInput['action']): Promise<void> {
  const terminalStatus = action === 'APPROVE' ? 'APPROVED' : action === 'PARTIAL' ? 'PARTIAL' : action === 'REJECT' ? 'REJECTED' : 'RETURNED'
  const claimedRequest = await tx.request.updateMany({
    where: { id: step.requestId, version: step.request.version, totalApproved: step.request.totalApproved },
    data: { version: { increment: 1 } },
  })
  if (claimedRequest.count !== 1) throw new LifecycleRuleError('Request changed; retry the decision', 409)
  if (action === 'APPROVE' || action === 'PARTIAL') {
    const activeAllocations = await tx.allocation.count({ where: { requestId: step.requestId, status: { notIn: ['RELEASED', 'CANCELLED'] } } })
    if (activeAllocations > 0) throw new LifecycleRuleError('Request items with active allocations cannot be changed', 409)
  }
  const claimedStep = await tx.approvalStep.updateMany({
    where: { id: step.id, status: step.status, updatedAt: step.updatedAt },
    data: { status: terminalStatus, startedAt: step.startedAt ?? new Date(), completedAt: new Date() },
  })
  if (claimedStep.count !== 1) throw new LifecycleRuleError('Approval step changed; retry the decision', 409)
}

async function approveStep(tx: Transaction, step: ApprovalStep, input: ApprovalInput, session: SessionPayload) {
  const items = input.items ?? []
  const { totalApproved, isPartial } = calculateApprovedTotals(step.request.items, input)
  const nextStep = step.request.approvalSteps
    .filter((candidate) => candidate.stepOrder > step.stepOrder && candidate.status === 'PENDING')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0]
  const requestStatus = nextStep ? 'UNDER_REVIEW' : (isPartial ? 'PARTIALLY_APPROVED' : 'APPROVED')
  for (const item of items) {
    await tx.requestItem.update({ where: { id: item.requestItemId }, data: { approvedQuantity: item.approvedQuantity } })
  }
  await createDecisions(tx, step, input, session.userId)
  await tx.request.update({ where: { id: step.requestId }, data: {
    totalApproved,
    status: requestStatus,
    fulfilmentStatus: requestStatus === 'APPROVED' || requestStatus === 'PARTIALLY_APPROVED' ? 'APPROVED' : step.request.fulfilmentStatus,
    approvedAt: nextStep ? step.request.approvedAt : new Date(),
  } })
  if (nextStep) {
    const advanced = await tx.approvalStep.updateMany({
      where: { id: nextStep.id, status: 'PENDING' },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    })
    if (advanced.count !== 1) throw new LifecycleRuleError('Next approval step changed; retry the decision', 409)
  }
  const updatedStep = await tx.approvalStep.findUniqueOrThrow({ where: { id: step.id } })
  await audit(tx, session.userId, step.request.matchId, step.id, input.action, { status: step.status }, { status: input.action, requestStatus, totalApproved })
  return { step: updatedStep, requestStatus, totalApproved }
}

async function closeRequest(tx: Transaction, step: ApprovalStep, input: ApprovalInput, session: SessionPayload) {
  const requestStatus = input.action === 'REJECT' ? 'REJECTED' : 'RETURNED'
  await createDecisions(tx, step, input, session.userId)
  await tx.approvalStep.updateMany({
    where: { requestId: step.requestId, id: { not: step.id }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })
  await tx.request.update({ where: { id: step.requestId }, data: {
    status: requestStatus,
    rejectedAt: input.action === 'REJECT' ? new Date() : step.request.rejectedAt,
    fulfilmentStatus: 'CANCELLED',
  } })
  const updatedStep = await tx.approvalStep.findUniqueOrThrow({ where: { id: step.id } })
  await audit(tx, session.userId, step.request.matchId, step.id, input.action, { status: step.status }, { status: input.action, requestStatus })
  return { step: updatedStep, requestStatus, totalApproved: step.request.totalApproved }
}

async function createDecisions(tx: Transaction, step: ApprovalStep, input: ApprovalInput, userId: string): Promise<void> {
  const items = input.items?.length ? input.items : [{ requestItemId: null, approvedQuantity: 0 }]
  await tx.approvalDecision.createMany({ data: items.map((item) => ({
    stepId: step.id,
    requestId: step.requestId,
    requestItemId: item.requestItemId,
    decidedById: userId,
    action: input.action,
    requestedQty: item.requestItemId
      ? step.request.items.find((requestItem) => requestItem.id === item.requestItemId)?.requestedQuantity ?? 0
      : step.request.totalRequested,
    approvedQty: item.approvedQuantity,
    rejectedQty: input.action === 'REJECT' ? step.request.totalRequested : 0,
    remarks: input.remarks,
    confidentialRemarks: input.confidentialRemarks,
    rulesApplied: `Request version ${step.request.version}`,
  })) })
}

async function activeRoleIds(client: RoleClient, userId: string): Promise<string[]> {
  const assignments = await client.roleAssignment.findMany({
    where: {
      userId,
      isActive: true,
      scope: 'GLOBAL',
      matchId: null,
      role: { isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { roleId: true },
    distinct: ['roleId'],
  })
  return assignments.map((assignment) => assignment.roleId)
}

async function audit(tx: Transaction, userId: string, matchId: string, entityId: string, action: string, oldValues: object, newValues: object): Promise<void> {
  await tx.auditEvent.create({ data: {
    userId,
    matchId,
    entityType: 'APPROVAL_STEP',
    entityId,
    action,
    oldValues: JSON.stringify(oldValues),
    newValues: JSON.stringify(newValues),
    changedFields: ['status'],
  } })
}

function handleError(error: unknown, fallback: string): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ success: false, error: 'Invalid request data', details: error.flatten() }, { status: 400 })
  if (error instanceof SyntaxError) return responseError('Request body must be valid JSON', 400)
  if (error instanceof LifecycleRuleError) return responseError(error.message, error.status)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return responseError('Concurrent update detected; retry the request', 409)
  console.error(fallback, error)
  return responseError('Internal server error', 500)
}

function responseError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}


async function notifyDecision(requestStatus: string, stepId: string): Promise<void> {
  const step = await prisma.approvalStep.findUnique({
    where: { id: stepId },
    select: { request: { select: { requestNumber: true, createdById: true, totalApproved: true, totalRequested: true } } },
  })
  if (!step) return
  const { requestNumber, createdById, totalApproved, totalRequested } = step.request
  const subject = `Ticket request ${requestNumber} ${requestStatus.toLowerCase().replace('_', ' ')}`
  const body = `Your request ${requestNumber} is ${requestStatus.toLowerCase().replace('_', ' ')}. Approved ${totalApproved} of ${totalRequested} tickets.`
  await sendNotification({ recipientId: createdById, channel: 'EMAIL', subject, body, templateKey: requestStatus === 'APPROVED' ? 'request_approved' : 'request_rejected' })
}
