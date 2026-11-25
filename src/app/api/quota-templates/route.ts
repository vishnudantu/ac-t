import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const templateSchema = z.object({
  name: z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 _&/-]*$/, 'Use letters, numbers, spaces, ampersands, hyphens or slashes'),
  displayName: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).nullish(),
}).strict()

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'quotas:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const templates = await prisma.quotaTemplate.findMany({
    where: { isActive: true },
    orderBy: { displayName: 'asc' },
  })
  return NextResponse.json({ success: true, templates })
})

export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'quotas:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = templateSchema.parse(await request.json())
  const normalised = data.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.quotaTemplate.create({
      data: { name: normalised, displayName: data.displayName, description: data.description ?? null },
    })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'QUOTA_TEMPLATE', entityId: created.id, action: 'CREATE',
      newValues: JSON.stringify({ name: created.name, displayName: created.displayName }),
      changedFields: ['name', 'displayName'],
    } })
    return created
  })
  return NextResponse.json({ success: true, template }, { status: 201 })
})
