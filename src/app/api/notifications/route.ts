import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

export const GET = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'notifications:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const channel = z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP']).optional().parse(request.nextUrl.searchParams.get('channel') || undefined)
  const status = z.enum(['PENDING', 'SENT', 'FAILED', 'SKIPPED']).optional().parse(request.nextUrl.searchParams.get('status') || undefined)
  const logs = await prisma.notificationLog.findMany({
    where: { channel, status },
    include: { recipient: { select: { id: true, fullName: true, email: true, mobileNumber: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const summary = await prisma.notificationLog.groupBy({ by: ['status'], _count: { _all: true } })
  return NextResponse.json({ success: true, logs, summary: summary.map((row) => ({ status: row.status, count: row._count._all })) })
})
