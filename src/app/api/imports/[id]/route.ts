import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api'
import { hasPermission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(200)
const listPermissions = ['requests:bulk_import', 'requests:write', 'inventory:import', 'quotas:write']

export const GET = withApiHandler<Context>(async (_request, session, context) => {
  if (!listPermissions.some((permission) => hasPermission(session.permissions, permission))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  if (!context) return NextResponse.json({ success: false, error: 'Import job ID required' }, { status: 400 })
  const id = idSchema.parse((await context.params).id)
  const job = await prisma.importJob.findUnique({
    where: { id }, include: {
      match: { select: { id: true, title: true } }, creator: { select: { id: true, fullName: true, email: true } },
      rows: { orderBy: { rowNumber: 'asc' }, take: 200 },
    },
  })
  if (!job) return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 })
  return NextResponse.json({ success: true, job, rows: job.rows })
})
