import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(200)

const workflowUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).nullish(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Workflow ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'approvals:configure')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const data = workflowUpdateSchema.parse(await request.json())
  const current = await prisma.approvalWorkflow.findUnique({ where: { id }, select: { id: true, matchId: true, name: true, isDefault: true, isActive: true } })
  if (!current) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  const workflow = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.approvalWorkflow.updateMany({ where: { matchId: current.matchId, isDefault: true, id: { not: id } }, data: { isDefault: false } })
    const updated = await tx.approvalWorkflow.update({ where: { id }, data, include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: true } } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'APPROVAL_WORKFLOW', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ name: current.name, isDefault: current.isDefault, isActive: current.isActive }),
      newValues: JSON.stringify({ name: updated.name, isDefault: updated.isDefault, isActive: updated.isActive }),
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
