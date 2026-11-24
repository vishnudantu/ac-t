import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }

const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  designation: z.string().trim().max(150).nullish(),
  department: z.string().trim().max(150).nullish(),
  isActive: z.boolean().optional(),
  roleId: z.string().trim().min(1).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'users:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().min(1).max(200).parse((await context.params).id)
  const { roleId, ...data } = userUpdateSchema.parse(await request.json())
  const current = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, isActive: true } })
  if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (id === session.userId && data.isActive === false) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }
  const user = await prisma.$transaction(async (tx) => {
    if (roleId) {
      if (!hasPermission(session.permissions, 'users:assign_roles')) throw new Error('You cannot assign roles')
      const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true, isActive: true } })
      if (!role?.isActive) throw new Error('Select an active role')
      await tx.roleAssignment.updateMany({ where: { userId: id, scope: 'GLOBAL', isActive: true }, data: { isActive: false } })
      await tx.roleAssignment.create({ data: { userId: id, roleId, assignedBy: session.userId, scope: 'GLOBAL' } })
    }
    const updated = await tx.user.update({ where: { id }, data })
    if (data.isActive === false) {
      await tx.sessionToken.deleteMany({ where: { userId: id } })
    }
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'USER', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ fullName: current.fullName, isActive: current.isActive }),
      newValues: JSON.stringify({ fullName: updated.fullName, isActive: updated.isActive }),
      changedFields: [...Object.keys(data), ...(roleId ? ['roleId'] : [])],
    } })
    return updated
  })
  return NextResponse.json({ success: true, user: { id: user.id, fullName: user.fullName, isActive: user.isActive } })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete records' }, { status: 403 })
  const id = z.string().min(1).max(200).parse((await context.params).id)
  if (id === session.userId) return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  const current = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, fullName: true } })
  if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const [requests, approvals, allocations, issuances, audits] = await Promise.all([
    prisma.request.count({ where: { OR: [{ createdById: id }, { assignedToId: id }] } }),
    prisma.approvalDecision.count({ where: { decidedById: id } }),
    prisma.allocation.count({ where: { officerId: id } }),
    prisma.ticketIssuance.count({ where: { distributedById: id } }),
    prisma.auditEvent.count({ where: { userId: id } }),
  ])
  if (requests + approvals + allocations + issuances + audits > 0) {
    return NextResponse.json({ error: 'This account has operational history and cannot be deleted. Deactivate it instead to preserve the audit trail.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.sessionToken.deleteMany({ where: { userId: id } })
    await tx.user.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'USER', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'email', 'fullName'],
    } })
  })
  return NextResponse.json({ success: true })
})
