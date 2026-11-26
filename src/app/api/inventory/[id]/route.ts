import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { ApiError, withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const updateSchema = z.object({
  adjustmentReason: z.string().trim().min(1).max(2000).optional(),
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
    const purpose = data.ticketPurpose ?? current.ticketPurpose
    if (purpose !== current.ticketPurpose && (current.allocatedQuantity || current.issuedQuantity || current.reservedQuantity)) {
      throw new ApiError(409, 'A pool with committed or issued tickets cannot change ticket purpose')
    }
    const total = data.totalQuantity ?? current.totalQuantity
    const complimentary = data.complimentaryQuantity ?? current.complimentaryQuantity
    const purchase = data.purchaseQuantity ?? current.purchaseQuantity
    const stockChanged = purpose !== current.ticketPurpose || total !== current.totalQuantity
      || complimentary !== current.complimentaryQuantity || purchase !== current.purchaseQuantity
    if (stockChanged && purpose === 'MIXED' && complimentary + purchase !== total) {
      throw new ApiError(422, 'The complimentary and purchase quantities must add up to total stock')
    }
    const delta = total - current.totalQuantity
    if (delta < -current.availableQuantity) {
      throw new ApiError(409, 'Stock reduction exceeds available stock in this pool')
    }
    const { adjustmentReason, ...changes } = data
    if (delta && !adjustmentReason) throw new ApiError(400, 'A reason is required to change stock quantity')
    const claim = await tx.inventoryPool.updateMany({
      where: { id, availableQuantity: current.availableQuantity, updatedAt: current.updatedAt },
      data: { ...changes, ...(delta ? { availableQuantity: { increment: delta } } : {}) },
    })
    if (claim.count !== 1) throw new ApiError(409, 'Inventory changed. Refresh before adjusting the pool.')
    if (delta) await tx.match.update({ where: { id: current.matchId }, data: { totalInventory: { increment: delta } } })
    const updated = await tx.inventoryPool.findUniqueOrThrow({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'INVENTORY', entityId: id, action: 'ADJUST', reason: adjustmentReason,
      oldValues: JSON.stringify({ totalQuantity: current.totalQuantity, availableQuantity: current.availableQuantity }),
      newValues: JSON.stringify({ totalQuantity: updated.totalQuantity, availableQuantity: updated.availableQuantity }), changedFields: Object.keys(changes),
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
  await prisma.$transaction(async (tx) => {
    // Lock the parent before checking its history. Concurrent inserts that
    // reference the pool must finish first or wait for this transaction.
    await tx.$queryRaw`SELECT "id" FROM "InventoryPool" WHERE "id" = ${id} FOR UPDATE`
    const current = await tx.inventoryPool.findUnique({
      where: { id },
      select: {
        id: true, matchId: true, standName: true, blockName: true, totalQuantity: true,
        reservedQuantity: true, allocatedQuantity: true, issuedQuantity: true, returnedQuantity: true, voidQuantity: true,
        _count: { select: { allocations: true, ticketSerials: true } },
      },
    })
    if (!current) throw new ApiError(404, 'Inventory not found')
    if (current._count.allocations || current._count.ticketSerials || current.reservedQuantity
      || current.allocatedQuantity || current.issuedQuantity || current.returnedQuantity || current.voidQuantity) {
      throw new ApiError(409, 'This pool has inventory history and cannot be deleted.')
    }
    await tx.inventoryPool.delete({ where: { id } })
    await tx.match.update({ where: { id: current.matchId }, data: { totalInventory: { decrement: current.totalQuantity } } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'INVENTORY', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'totalQuantity'],
    } })
  }, { isolationLevel: "ReadCommitted" })
  return NextResponse.json({ success: true })
})
