import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { matchCreateSchema } from '@/lib/validation'
import { z } from 'zod'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(100)

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Match ID required' }, { status: 400 })
  if (!hasRole(session.roles, ['SUPER_ADMIN', 'MATCH_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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

/**
 * Super administrators may delete a match outright. Every dependent record
 * (requests, approvals, allocations, issuance, inventory, quotas, categories,
 * sessions, workflows, audit events) is removed with it.
 */
export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Match ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Only a super administrator can delete a match' }, { status: 403 })
  }
  const id = idSchema.parse((await context.params).id)
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id }, select: { id: true, title: true } })
    if (!match) return null
    // Rows whose match link is nullable must be cleared or removed explicitly.
    await tx.auditEvent.deleteMany({ where: { matchId: id } })
    await tx.importJob.deleteMany({ where: { matchId: id } })
    await tx.exportJob.deleteMany({ where: { matchId: id } })
    await tx.roleAssignment.deleteMany({ where: { matchId: id } })
    // Clones keep existing but lose their link.
    await tx.match.updateMany({ where: { clonedFromMatchId: id }, data: { clonedFromMatchId: null } })
    // Remaining dependent tables cascade from Match.
    await tx.match.delete({ where: { id } })
    return match
  })
  if (!result) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  return NextResponse.json({ success: true, deleted: result })
})
