import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const querySchema = z.object({
  action: z.string().trim().max(50).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict()

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'audit:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where: Prisma.AuditEventWhereInput = {
    action: query.action && query.action !== 'all' ? query.action : undefined,
    ...(query.search ? { OR: [
      { eventId: { contains: query.search, mode: 'insensitive' } },
      { entityId: { contains: query.search, mode: 'insensitive' } },
      { entityType: { contains: query.search, mode: 'insensitive' } },
      { user: { email: { contains: query.search, mode: 'insensitive' } } },
    ] } : {}),
  }
  const [events, total] = await prisma.$transaction([
    prisma.auditEvent.findMany({
      where, include: { user: { select: { id: true, fullName: true, email: true } }, match: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset,
    }),
    prisma.auditEvent.count({ where }),
  ])
  return NextResponse.json({ success: true, events, total })
})
