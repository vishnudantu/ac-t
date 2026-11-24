import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { matchCreateSchema } from '@/lib/validation'
import { z } from 'zod'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(100)

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Match ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'matches:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const data = matchCreateSchema.partial().extend({ status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional() }).strict().parse(await request.json())
  const match = await prisma.$transaction(async (tx) => {
    const current = await tx.match.findUnique({ where: { id }, include: { requests: { select: { id: true }, take: 1 } } })
    if (!current) return null
    if (current.requests.length && (data.matchDate || data.venueId)) throw new Error('Matches with requests cannot change their date or venue')
    if (data.venueId) {
      const venue = await tx.venue.findUnique({ where: { id: data.venueId }, select: { isActive: true } })
      if (!venue?.isActive) throw new Error('Select an active venue')
    }
    const updated = await tx.match.update({ where: { id }, data, include: { venue: true } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: id, entityType: 'MATCH', entityId: id,
      action: 'UPDATE', oldValues: JSON.stringify({ title: current.title, status: current.status }),
      newValues: JSON.stringify({ title: updated.title, status: updated.status }), changedFields: Object.keys(data),
    } })
    return updated
  })
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  return NextResponse.json({ success: true, match })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Match ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'matches:delete')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const deleted = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id }, select: { id: true, title: true } })
    if (!match) return null
    const [requests, inventory, quotas, batches, allocations] = await Promise.all([
      tx.request.count({ where: { matchId: id } }),
      tx.inventoryPool.count({ where: { matchId: id } }),
      tx.quotaPool.count({ where: { matchId: id } }),
      tx.distributionBatch.count({ where: { matchId: id } }),
      tx.allocation.count({ where: { matchId: id } }),
    ])
    if (requests + inventory + quotas + batches + allocations > 0) {
      return NextResponse.json({ success: false, error: 'This match has operational records and cannot be deleted. Cancel it instead to preserve the audit trail.' }, { status: 409 })
    }
    await tx.match.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'MATCH', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(match), changedFields: ['id', 'title'],
    } })
    return NextResponse.json({ success: true })
  })
  if (!deleted) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  return deleted
})
