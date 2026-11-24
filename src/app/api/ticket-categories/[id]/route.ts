import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const categoryUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullish(),
  pricingTier: z.number().int().min(0).max(10).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  colorCode: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #1e3a8a').nullish(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Category ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'matches:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().trim().min(1).max(200).parse((await context.params).id)
  const data = categoryUpdateSchema.parse(await request.json())
  const current = await prisma.ticketCategory.findUnique({ where: { id }, select: { id: true, matchId: true, displayName: true, isActive: true } })
  if (!current) return NextResponse.json({ error: 'Ticket category not found' }, { status: 404 })
  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.ticketCategory.update({ where: { id }, data })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'TICKET_CATEGORY', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ displayName: current.displayName, isActive: current.isActive }),
      newValues: JSON.stringify({ displayName: updated.displayName, isActive: updated.isActive }),
      changedFields: Object.keys(data),
    } })
    return updated
  })
  return NextResponse.json({ success: true, category })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Category ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete records' }, { status: 403 })
  const id = z.string().trim().min(1).max(200).parse((await context.params).id)
  const current = await prisma.ticketCategory.findUnique({ where: { id }, select: { id: true, matchId: true, displayName: true } })
  if (!current) return NextResponse.json({ error: 'Ticket category not found' }, { status: 404 })
  const [inventory, requestItems, quotaAllocations, allocationItems] = await Promise.all([
    prisma.inventoryPool.count({ where: { ticketCategoryId: id } }),
    prisma.requestItem.count({ where: { ticketCategoryId: id } }),
    prisma.quotaAllocation.count({ where: { ticketCategoryId: id } }),
    prisma.allocationItem.count({ where: { ticketCategoryId: id } }),
  ])
  if (inventory + requestItems + quotaAllocations + allocationItems > 0) {
    return NextResponse.json({ error: 'This category is used by inventory, requests, or quotas. Deactivate it instead.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.ticketCategory.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'TICKET_CATEGORY', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'displayName'],
    } })
  })
  return NextResponse.json({ success: true })
})
