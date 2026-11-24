import type { Prisma } from '@prisma/client'

type Transaction = Prisma.TransactionClient

/**
 * Matches need an active approval workflow before requests can be submitted.
 * Matches created after seeding have none, which used to dead-end submissions
 * with "no active approval workflow". When a match has no active workflow we
 * create a default single-step workflow owned by APPROVAL_AUTHORITY (falling
 * back to SUPER_ADMIN), and re-read with its steps so the caller can clone them
 * onto the request.
 */
export async function ensureApprovalWorkflow(
  tx: Transaction,
  matchId: string,
): Promise<{ id: string; steps: Array<{
  id: string
  stepOrder: number
  name: string
  approverRoleId: string | null
  approverUserId: string | null
  timeoutHours: number | null
}> } | null> {
  const workflowWithSteps = {
    steps: { where: { isActive: true }, orderBy: { stepOrder: 'asc' } },
  } as const
  const existing = await tx.approvalWorkflow.findFirst({
    where: { matchId, isActive: true },
    include: workflowWithSteps,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  if (existing?.steps.length) return existing

  const approverRole = await tx.role.findFirst({
    where: {
      name: { in: ['APPROVAL_AUTHORITY', 'SUPER_ADMIN'] },
      isActive: true,
      permissions: { some: { permission: { key: 'approvals:decide' } } },
    },
    orderBy: { name: 'asc' },
    select: { id: true },
  })
  if (!approverRole) {
    // Seeding has not run yet; no role can decide, so keep the previous guard.
    return null
  }

  const workflow = await tx.approvalWorkflow.create({
    data: {
      matchId,
      name: 'Standard Approval',
      description: 'Default approval workflow created automatically for this match.',
      isDefault: true,
      isActive: true,
      steps: { create: {
        stepOrder: 1,
        name: 'Approval review',
        description: 'Review and decide the ticket request.',
        approverRoleId: approverRole.id,
        minQuantity: 0,
        allowPartialApproval: true,
        allowReturnForClarification: true,
        allowEscalation: true,
        timeoutHours: 48,
      } },
    },
    include: workflowWithSteps,
  })
  return workflow
}
