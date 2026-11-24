import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const createUserSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2).max(150),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
  designation: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
}).strict()

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'users:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, email: true, fullName: true, designation: true, department: true,
        isActive: true, mfaEnabled: true, lastLoginAt: true, createdAt: true,
        roleAssignments: { where: { isActive: true, scope: 'GLOBAL' }, select: { role: { select: { id: true, name: true, displayName: true } } } },
      }, orderBy: { fullName: 'asc' }, take: 200,
    }),
    prisma.role.findMany({ where: { isActive: true }, select: { id: true, name: true, displayName: true }, orderBy: { displayName: 'asc' } }),
  ])
  return NextResponse.json({ success: true, users, roles })
})

export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, ['users:write', 'users:assign_roles'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = createUserSchema.parse(await request.json())
  const user = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: data.roleId }, select: { id: true, isActive: true } })
    if (!role?.isActive) throw new Error('Select an active role')
    const created = await tx.user.create({ data: {
      email: data.email, fullName: data.fullName, passwordHash: await hashPassword(data.password),
      designation: data.designation, department: data.department,
      roleAssignments: { create: { roleId: data.roleId, assignedBy: session.userId, scope: 'GLOBAL' } },
    }, select: { id: true, email: true, fullName: true } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'USER', entityId: created.id, action: 'CREATE',
      newValues: JSON.stringify({ email: data.email, fullName: data.fullName, roleId: data.roleId }), changedFields: ['email', 'fullName', 'roleId'],
    } })
    return created
  })
  return NextResponse.json({ success: true, user }, { status: 201 })
})
