import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(200)

const roleUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).nullish(),
  permissionIds: z.array(z.string().min(1)).max(200).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Role ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'roles:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const { permissionIds, ...data } = roleUpdateSchema.parse(await request.json())
  const current = await prisma.role.findUnique({ where: { id }, select: { id: true, name: true, isSystem: true, isActive: true } })
  if (!current) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  const role = await prisma.$transaction(async (tx) => {
    if (permissionIds) {
      const count = await tx.permission.count({ where: { id: { in: permissionIds } } })
      if (count !== new Set(permissionIds).size) throw new Error('One or more permissions are invalid')
      await tx.rolePermission.deleteMany({ where: { roleId: id } })
      await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) })
    }
    const updated = await tx.role.update({ where: { id }, data: {
      ...data,
      ...(current.isSystem ? { displayName: undefined, description: undefined } : {}),
    }, include: { permissions: { include: { permission: true } } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'ROLE', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ name: current.name, isActive: current.isActive }),
      newValues: JSON.stringify({ name: updated.name, isActive: updated.isActive, permissionCount: permissionIds?.length }),
      changedFields: Object.keys(data),
    } })
    return updated
  })
  return NextResponse.json({ success: true, role })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Role ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete roles' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const current = await prisma.role.findUnique({ where: { id }, select: { id: true, name: true, isSystem: true } })
  if (!current) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (current.isSystem) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 })
  const assignments = await prisma.roleAssignment.count({ where: { roleId: id, isActive: true } })
  if (assignments > 0) {
    return NextResponse.json({ error: 'This role is assigned to users. Reassign them first.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'ROLE', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify({ name: current.name }), changedFields: ['id', 'name'],
    } })
  })
  return NextResponse.json({ success: true })
})
