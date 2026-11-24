import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const updateSchema = z.object({
  totalQuantity: z.number().int().min(0).max(2_000_000).optional(),
  standName: z.string().trim().min(1).max(250).optional(),
  blockName: z.string().trim().max(100).nullish(),
  gateName: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(2000).nullish(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

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
