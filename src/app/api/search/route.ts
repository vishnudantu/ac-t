import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const searchSchema = z.object({
  q: z.string().trim().min(2).max(200),
}).strict()

export const GET = withApiHandler(async (request: NextRequest, session) => {
  const { q } = searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const results: Array<{ type: string; id: string; title: string; subtitle: string; href: string }> = []

  const searches: Promise<void>[] = []
  if (hasPermission(session.permissions, 'requests:read')) {
    searches.push(prisma.request.findMany({
      where: { OR: [
        { requestNumber: { contains: q, mode: 'insensitive' } },
        { requester: { fullName: { contains: q, mode: 'insensitive' } } },
        { requester: { mobileNumber: { contains: q } } },
        { requester: { email: { contains: q, mode: 'insensitive' } } },
      ] },
      select: { id: true, requestNumber: true, requester: { select: { fullName: true } }, match: { select: { title: true } } },
      orderBy: { createdAt: 'desc' }, take: 8,
    }).then((rows) => rows.forEach((row) => results.push({
      type: 'Request', id: row.id, title: row.requestNumber,
      subtitle: `${row.requester.fullName} · ${row.match.title}`,
      href: `/requests/${row.id}`,
    }))))
  }
  if (hasPermission(session.permissions, 'requests:read')) {
    searches.push(prisma.requester.findMany({
      where: { isActive: true, OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { mobileNumber: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ] },
      select: { id: true, fullName: true, mobileNumber: true, organisation: { select: { name: true } } },
      orderBy: { fullName: 'asc' }, take: 8,
    }).then((rows) => rows.forEach((row) => results.push({
      type: 'Requester', id: row.id, title: row.fullName,
      subtitle: `${row.mobileNumber}${row.organisation ? ` · ${row.organisation.name}` : ''}`,
      href: `/requesters?search=${encodeURIComponent(row.fullName)}`,
    }))))
  }
  if (hasPermission(session.permissions, 'matches:read')) {
    searches.push(prisma.match.findMany({
      where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { tournament: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, title: true, matchDate: true, venue: { select: { name: true } } },
      orderBy: { matchDate: 'desc' }, take: 6,
    }).then((rows) => rows.forEach((row) => results.push({
      type: 'Match', id: row.id, title: row.title,
      subtitle: `${row.venue.name} · ${new Date(row.matchDate).toLocaleDateString('en-IN')}`,
      href: `/matches?search=${encodeURIComponent(row.title)}`,
    }))))
  }
  await Promise.all(searches)
  return NextResponse.json({ success: true, results })
})
