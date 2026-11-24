import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const roleSchema = z.object({
  name: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,60}$/),
  displayName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  permissionIds: z.array(z.string().min(1)).max(200),
}).strict()

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'roles:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ include: {
      permissions: { include: { permission: { select: { id: true, key: true, displayName: true } } } },
      _count: { select: { assignments: true } },
    }, orderBy: { name: 'asc' }, take: 100 }),
    prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { displayName: 'asc' }], take: 200 }),
  ])
  return NextResponse.json({ success: true, roles, permissions })
})

export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'roles:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = roleSchema.parse(await request.json())
  const role = await prisma.$transaction(async (tx) => {
    const count = await tx.permission.count({ where: { id: { in: data.permissionIds } } })
    if (count !== new Set(data.permissionIds).size) throw new Error('One or more permissions are invalid')
    const created = await tx.role.create({ data: {
      name: data.name, displayName: data.displayName, description: data.description,
      permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
    }, include: { permissions: { include: { permission: true } } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'ROLE', entityId: created.id, action: 'CREATE',
      newValues: JSON.stringify({ name: data.name, permissionIds: data.permissionIds }), changedFields: ['name', 'permissionIds'],
    } })
    return created
  })
  return NextResponse.json({ success: true, role }, { status: 201 })
})
