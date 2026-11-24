import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const stepSchema = z.object({
  stepOrder: z.number().int().min(1).max(20),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).nullish(),
  approverRoleId: z.string().trim().min(1).nullish(),
  approverUserId: z.string().trim().min(1).nullish(),
  minQuantity: z.number().int().min(0).max(1_000_000).default(0),
  maxQuantity: z.number().int().min(0).max(1_000_000).nullish(),
  allowPartialApproval: z.boolean().default(true),
  allowReturnForClarification: z.boolean().default(true),
  allowEscalation: z.boolean().default(true),
  timeoutHours: z.number().int().min(1).max(720).nullish(),
  isActive: z.boolean().default(true),
}).strict().refine((step) => step.approverRoleId || step.approverUserId, {
  message: 'Each step needs an approver role or a specific approver', path: ['approverRoleId'],
}).refine((step) => step.maxQuantity === undefined || step.maxQuantity === null || step.maxQuantity >= step.minQuantity, {
  message: 'Maximum quantity must be at least the minimum quantity', path: ['maxQuantity'],
})

const workflowUpsertSchema = z.object({
  matchId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(1000).nullish(),
  isDefault: z.boolean().default(true),
  steps: z.array(stepSchema).min(1).max(10),
}).strict().superRefine((value, context) => {
  const orders = new Set(value.steps.map((step) => step.stepOrder))
  if (orders.size !== value.steps.length) context.addIssue({ code: 'custom', path: ['steps'], message: 'Step order values must be unique' })
})

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'approvals:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const matchId = z.string().trim().min(1).max(100).parse(request.nextUrl.searchParams.get('matchId'))
  const workflows = await prisma.approvalWorkflow.findMany({
    where: { matchId },
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: {
          approverRole: { select: { id: true, name: true, displayName: true } },
        },
      },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ success: true, workflows })
})

export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'approvals:configure')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = workflowUpsertSchema.parse(await request.json())
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: data.matchId }, select: { id: true, title: true } })
    if (!match) return null
    const roleIds = [...new Set(data.steps.map((step) => step.approverRoleId).filter(Boolean))] as string[]
    if (roleIds.length) {
      const roles = await tx.role.findMany({ where: { id: { in: roleIds }, isActive: true }, select: { id: true } })
      if (roles.length !== roleIds.length) throw new Error('One or more approver roles are invalid or inactive')
    }
    if (data.isDefault) await tx.approvalWorkflow.updateMany({ where: { matchId: data.matchId, isDefault: true }, data: { isDefault: false } })
    const workflow = await tx.approvalWorkflow.create({
      data: {
        matchId: data.matchId, name: data.name, description: data.description, isDefault: data.isDefault,
        steps: { create: data.steps },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: true } } },
    })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: data.matchId, entityType: 'APPROVAL_WORKFLOW', entityId: workflow.id, action: 'CREATE',
      newValues: JSON.stringify({ name: data.name, steps: data.steps.map((step) => ({ order: step.stepOrder, name: step.name, roleId: step.approverRoleId })) }),
      changedFields: ['name', 'steps'],
    } })
    return workflow
  })
  if (!result) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  return NextResponse.json({ success: true, workflow: result }, { status: 201 })
})
