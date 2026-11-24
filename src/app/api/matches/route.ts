import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission, type SessionPayload } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { matchCreateSchema, matchListQuerySchema } from '@/lib/validation'
import { apiError } from '@/lib/api-core'

export const GET = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'matches:read')) return apiError('Forbidden', 403)
  const query = matchListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where: Prisma.MatchWhereInput = query.status && query.status !== 'all' ? { status: query.status } : {}
  const [matches, total] = await prisma.$transaction([
    prisma.match.findMany({
      where,
      include: {
        venue: true,
        matchAdmin: { select: { id: true, fullName: true, email: true } },
        _count: { select: { requests: true, ticketCategories: true, inventoryPools: true } },
      },
      orderBy: { matchDate: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.match.count({ where }),
  ])
  return NextResponse.json({ success: true, matches, total })
})

export const POST = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'matches:write')) return apiError('Forbidden', 403)
  const data = matchCreateSchema.parse(await request.json())
  const venue = await prisma.venue.findUnique({ where: { id: data.venueId }, select: { id: true, isActive: true } })
  if (!venue?.isActive) return apiError('Select an active venue', 422)
  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.match.create({ data: { ...data, matchAdminId: session.userId }, include: { venue: true } })
    await tx.auditEvent.create({ data: {
      userId: session.userId,
      matchId: created.id,
      entityType: 'MATCH',
      entityId: created.id,
      action: 'CREATE',
      newValues: JSON.stringify({ title: data.title, matchDate: data.matchDate, venueId: data.venueId }),
      changedFields: ['title', 'matchDate', 'venueId'],
    } })
    return created
  })
  return NextResponse.json({ success: true, match }, { status: 201 })
})
