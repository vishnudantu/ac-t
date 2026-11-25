import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { renumberWorkflowSteps, workflowStepsSchema, type WorkflowStepsInput } from '@/lib/validation'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(200)

const workflowUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  steps: workflowStepsSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

interface StepSummarySource {
  stepOrder: number
  name: string
  approverRoleId: string | null
  approverUserId: string | null
}

function summarizeSteps(steps: ReadonlyArray<StepSummarySource>): Array<{ order: number; name: string; roleId: string | null; userId: string | null }> {
  return steps.map((step) => ({
    order: step.stepOrder,
    name: step.name,
    roleId: step.approverRoleId ?? null,
    userId: step.approverUserId ?? null,
  }))
}

/** Returns an error response when the workflow's step definitions cannot be replaced. */
async function guardStepReplacement(
  workflowId: string,
  steps: WorkflowStepsInput,
): Promise<NextResponse | null> {
  const inFlightSteps = await prisma.approvalStep.count({ where: { stepDefinition: { workflowId } } })
  if (inFlightSteps > 0) {
    return NextResponse.json(
      { error: 'This workflow has in-flight approval steps, so its steps cannot be replaced. Wait for those approvals to finish or deactivate the workflow.' },
      { status: 409 },
    )
  }
  const roleIds = [...new Set(steps.map((step) => step.approverRoleId).filter((roleId): roleId is string => Boolean(roleId)))]
  if (roleIds.length) {
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds }, isActive: true }, select: { id: true } })
    if (roles.length !== roleIds.length) {
      return NextResponse.json({ error: 'One or more approver roles are invalid or inactive' }, { status: 422 })
    }
  }
  return null
}

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Workflow ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'approvals:configure')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const data = workflowUpdateSchema.parse(await request.json())
  const current = await prisma.approvalWorkflow.findUnique({
    where: { id },
    select: {
      id: true, matchId: true, name: true, isDefault: true, isActive: true,
      steps: { orderBy: { stepOrder: 'asc' } },
    },
  })
  if (!current) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })

  if (data.steps) {
    const rejection = await guardStepReplacement(id, data.steps)
    if (rejection) return rejection
  }
  const replacementSteps = data.steps ? renumberWorkflowSteps(data.steps) : undefined

  const workflow = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.approvalWorkflow.updateMany({ where: { matchId: current.matchId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
    if (replacementSteps) await tx.approvalStepDefinition.deleteMany({ where: { workflowId: id } })
    const updateData: {
      name?: string
      description?: string | null
      isDefault?: boolean
      isActive?: boolean
      steps?: { create: WorkflowStepsInput }
    } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (replacementSteps) updateData.steps = { create: replacementSteps }
    const updated = await tx.approvalWorkflow.update({ where: { id }, data: updateData, include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: true } } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'APPROVAL_WORKFLOW', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({
        name: current.name, isDefault: current.isDefault, isActive: current.isActive,
        ...(replacementSteps ? { steps: summarizeSteps(current.steps) } : {}),
      }),
      newValues: JSON.stringify({
        name: updated.name, isDefault: updated.isDefault, isActive: updated.isActive,
        ...(replacementSteps ? { steps: summarizeSteps(updated.steps) } : {}),
      }),
      changedFields: Object.keys(data),
    } })
    return updated
  })
  return NextResponse.json({ success: true, workflow })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Workflow ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete workflows' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const current = await prisma.approvalWorkflow.findUnique({
    where: { id },
    select: { id: true, matchId: true, name: true, _count: { select: { steps: { where: { approvalSteps: { some: {} } } } } } },
  })
  if (!current) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  if (current._count.steps > 0) {
    return NextResponse.json({ error: 'This workflow is used by in-flight approval steps. Deactivate it instead.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.approvalWorkflow.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'APPROVAL_WORKFLOW', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify({ name: current.name }), changedFields: ['id', 'name'],
    } })
  })
  return NextResponse.json({ success: true })
})
