import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const idSchema = z.string().trim().min(1).max(100)

const quotaUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(500).optional(),
  description: z.string().trim().max(2000).nullish(),
  ownerId: z.string().trim().min(1).nullish(),
  isActive: z.boolean().optional(),
  allocations: z.array(z.object({
    ticketCategoryId: z.string().trim().min(1),
    allocatedQuantity: z.number().int().positive().max(2_000_000),
  }).strict()).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Quota ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'quotas:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const input = quotaUpdateSchema.parse(await request.json())

  const quota = await prisma.$transaction(async (tx) => {
    const current = await tx.quotaPool.findUnique({ where: { id }, include: { quotaAllocations: true } })
    if (!current) return null
    if (input.ownerId) {
      const owner = await tx.user.findUnique({ where: { id: input.ownerId }, select: { isActive: true } })
      if (!owner?.isActive) throw new Error('Quota owner is not active')
    }
    if (input.allocations) {
      const categories = await tx.ticketCategory.findMany({
        where: { id: { in: input.allocations.map((item) => item.ticketCategoryId) } },
        select: { matchId: true, isActive: true },
      })
      if (categories.length !== input.allocations.length || categories.some((category) => category.matchId !== current.matchId || !category.isActive)) {
        throw new Error('Every quota category must be active and belong to the match')
      }
      await tx.quotaAllocation.deleteMany({ where: { quotaPoolId: id } })
      await tx.quotaAllocation.createMany({ data: input.allocations.map((item) => ({
        quotaPoolId: id, ticketCategoryId: item.ticketCategoryId, allocatedQuantity: item.allocatedQuantity,
      })) })
    }
    const totalAllocation = input.allocations
      ? input.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)
      : undefined
    const updated = await tx.quotaPool.update({
      where: { id },
      data: {
        displayName: input.displayName,
        description: input.description,
        ownerId: input.ownerId,
        isActive: input.isActive,
        ...(totalAllocation === undefined ? {} : { totalAllocation }),
      },
      include: {
        match: { select: { id: true, title: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        quotaAllocations: { include: { ticketCategory: { select: { id: true, name: true, displayName: true } } } },
        childQuotas: { select: { id: true, name: true, displayName: true } },
        _count: { select: { quotaTransfersFrom: true, quotaTransfersTo: true } },
      },
    })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'QUOTA', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ displayName: current.displayName, totalAllocation: current.totalAllocation, isActive: current.isActive }),
      newValues: JSON.stringify({ displayName: updated.displayName, totalAllocation: updated.totalAllocation, isActive: updated.isActive }),
      changedFields: Object.keys(input),
    } })
    return updated
  })
  if (!quota) return NextResponse.json({ error: 'Quota pool not found' }, { status: 404 })
  return NextResponse.json({ success: true, quota })
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Quota ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete records' }, { status: 403 })
  const id = idSchema.parse((await context.params).id)
  const current = await prisma.quotaPool.findUnique({ where: { id }, select: { id: true, matchId: true, name: true, displayName: true } })
  if (!current) return NextResponse.json({ error: 'Quota pool not found' }, { status: 404 })
  const [allocations, transfers, inventory, children] = await Promise.all([
    prisma.quotaAllocation.count({ where: { quotaPoolId: id, consumedQuantity: { gt: 0 } } }),
    prisma.quotaTransfer.count({ where: { OR: [{ fromQuotaId: id }, { toQuotaId: id }] } }),
    prisma.inventoryPool.count({ where: { quotaPoolId: id } }),
    prisma.quotaPool.count({ where: { parentQuotaId: id } }),
  ])
  if (allocations + transfers + inventory + children > 0) {
    return NextResponse.json({ error: 'This quota has allocations, transfers, inventory, or child quotas and cannot be deleted. Deactivate it instead.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.quotaPool.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'QUOTA', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'name'],
    } })
  })
  return NextResponse.json({ success: true })
})
