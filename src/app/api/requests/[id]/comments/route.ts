import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(100)

export const GET = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'requests:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const comments = await prisma.requestComment.findMany({
    where: { requestId: id },
    include: { author: { select: { id: true, fullName: true, designation: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ success: true, comments })
})

export const POST = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'requests:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const { content } = z.object({ content: z.string().trim().min(1).max(2000) }).strict().parse(await request.json())
  const requestRecord = await prisma.request.findUnique({ where: { id }, select: { id: true, matchId: true } })
  if (!requestRecord) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.requestComment.create({
      data: { requestId: id, authorId: session.userId, content, isInternal: true },
      include: { author: { select: { id: true, fullName: true, designation: true } } },
    })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: requestRecord.matchId, entityType: 'REQUEST', entityId: id, action: 'COMMENT',
      changedFields: ['content'],
    } })
    return created
  })
  return NextResponse.json({ success: true, comment }, { status: 201 })
})
