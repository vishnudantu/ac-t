import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const venueUpdateSchema = z.object({
  name: z.string().trim().min(2).max(250).optional(),
  shortName: z.string().trim().min(2).max(100).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  capacity: z.number().int().positive().max(2_000_000).nullish(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Venue ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'matches:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().min(1).max(100).parse((await context.params).id)
  const data = venueUpdateSchema.parse(await request.json())
  const current = await prisma.venue.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  const venue = await prisma.$transaction(async (tx) => {
    const updated = await tx.venue.update({ where: { id }, data })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'VENUE', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ name: current.name, capacity: current.capacity }),
      newValues: JSON.stringify({ name: updated.name, capacity: updated.capacity }), changedFields: Object.keys(data),
    } })
    return updated
  })
  return NextResponse.json({ success: true, venue })
})
