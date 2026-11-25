import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const updateSchema = z.object({
  totalQuantity: z.number().int().min(0).max(2_000_000).optional(),
  standName: z.string().trim().min(1).max(250).optional(),
  blockName: z.string().trim().max(100).nullish(),
  gateName: z.string().trim().max(100).nullish(),
  rowStart: z.string().trim().max(50).nullish(),
  rowEnd: z.string().trim().max(50).nullish(),
  seatStart: z.number().int().positive().nullish(),
  seatEnd: z.number().int().positive().nullish(),
  ticketFormat: z.enum(['PHYSICAL', 'DIGITAL', 'BOTH']).optional(),
  ticketPurpose: z.enum(['COMPLIMENTARY', 'PURCHASE', 'MIXED']).optional(),
  complimentaryQuantity: z.number().int().min(0).max(2_000_000).optional(),
  purchaseQuantity: z.number().int().min(0).max(2_000_000).optional(),
  pricingUnit: z.enum(['PER_SEAT', 'PER_SUITE']).optional(),
  faceValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'faceValue must be a positive decimal').nullish(),
  notes: z.string().trim().max(2000).nullish(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')
  .refine((value) => value.seatStart === undefined || value.seatStart === null || value.seatEnd === undefined || value.seatEnd === null || value.seatEnd >= value.seatStart, {
    message: 'Seat end must be greater than or equal to seat start', path: ['seatEnd'],
  })

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Inventory ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'inventory:adjust')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().min(1).max(250).parse((await context.params).id)
  const data = updateSchema.parse(await request.json())
  const pool = await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryPool.findUnique({ where: { id } })
    if (!current) return null
    if (data.totalQuantity !== undefined) {
      const committed = current.allocatedQuantity + current.issuedQuantity + current.voidQuantity
      if (data.totalQuantity < committed) throw new Error(`Total quantity cannot be below ${committed} allocated, issued, or void tickets`)
      await tx.match.update({ where: { id: current.matchId }, data: { totalInventory: { increment: data.totalQuantity - current.totalQuantity } } })
    }
    const updated = await tx.inventoryPool.update({ where: { id }, data: {
      ...data,
      ...(data.totalQuantity !== undefined ? { availableQuantity: data.totalQuantity - current.allocatedQuantity - current.issuedQuantity - current.voidQuantity } : {}),
    } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'INVENTORY', entityId: id, action: 'ADJUST',
      oldValues: JSON.stringify({ totalQuantity: current.totalQuantity, availableQuantity: current.availableQuantity }),
      newValues: JSON.stringify({ totalQuantity: updated.totalQuantity, availableQuantity: updated.availableQuantity }), changedFields: Object.keys(data),
    } })
    return updated
  })
  if (!pool) return NextResponse.json({ error: 'Inventory not found' }, { status: 404 })
  return NextResponse.json({ success: true, inventory: pool })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Inventory ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete records' }, { status: 403 })
  const id = z.string().min(1).max(250).parse((await context.params).id)
  const current = await prisma.inventoryPool.findUnique({
    where: { id },
    select: { id: true, matchId: true, standName: true, blockName: true, totalQuantity: true },
  })
  if (!current) return NextResponse.json({ error: 'Inventory not found' }, { status: 404 })
  const [allocations, serials] = await Promise.all([
    prisma.allocationItem.count({ where: { inventoryPoolId: id } }),
    prisma.ticketSerial.count({ where: { inventoryPoolId: id } }),
  ])
  if (allocations + serials > 0) {
    return NextResponse.json({ error: 'This pool has allocation or serial history and cannot be deleted. Adjust its quantity to zero instead.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.inventoryPool.delete({ where: { id } })
    await tx.match.update({ where: { id: current.matchId }, data: { totalInventory: { decrement: current.totalQuantity } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'INVENTORY', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'totalQuantity'],
    } })
  })
  return NextResponse.json({ success: true })
})
