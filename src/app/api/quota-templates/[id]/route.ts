import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(200)

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'quotas:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const data = updateSchema.parse(await request.json())
  const current = await prisma.quotaTemplate.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Quota template not found' }, { status: 404 })
  const template = await prisma.$transaction(async (tx) => {
    const updated = await tx.quotaTemplate.update({ where: { id }, data })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'QUOTA_TEMPLATE', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ displayName: current.displayName, isActive: current.isActive }),
      newValues: JSON.stringify({ displayName: updated.displayName, isActive: updated.isActive }),
      changedFields: Object.keys(data),
    } })
    return updated
  })
  return NextResponse.json({ success: true, template })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete quota templates' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const current = await prisma.quotaTemplate.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!current) return NextResponse.json({ error: 'Quota template not found' }, { status: 404 })
  const inUse = await prisma.quotaPool.count({ where: { name: current.name } })
  if (inUse > 0) {
    return NextResponse.json({ error: `This template is used by ${inUse} quota pool(s). Deactivate it instead so match history is preserved.` }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.quotaTemplate.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'QUOTA_TEMPLATE', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'name'],
    } })
  })
  return NextResponse.json({ success: true })
})
