import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const replicateSchema = z.object({
  sourceMatchId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(250),
  tournament: z.string().trim().max(250).nullish(),
  matchDate: z.string().datetime({ offset: true }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  venueId: z.string().trim().min(1).max(100),
  copyCategories: z.boolean().default(true),
  copyInventory: z.boolean().default(true),
  copyQuotas: z.boolean().default(false),
}).strict()

/**
 * Clone the structural setup of an existing match (ticket categories, inventory
 * pools and optionally quota pools) onto a new match. Quantities are copied as
 * the new match's opening stock; consumed/issued counters start at zero so no
 * operational history leaks between matches. One audit event records the source.
 */
export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'matches:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const input = replicateSchema.parse(await request.json())

  const result = await prisma.$transaction(async (tx) => {
    const [source, venue] = await Promise.all([
      tx.match.findUnique({
        where: { id: input.sourceMatchId },
        include: {
          ticketCategories: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          inventoryPools: { include: { ticketCategory: { select: { name: true } } } },
          quotaPools: { where: { isActive: true }, include: { quotaAllocations: { include: { ticketCategory: { select: { name: true } } } } } },
        },
      }),
      tx.venue.findUnique({ where: { id: input.venueId }, select: { id: true, isActive: true } }),
    ])
    if (!source) return { status: 404 as const }
    if (!venue?.isActive) return { status: 422 as const, message: 'Select an active venue' }

    const totalInventory = input.copyInventory
      ? source.inventoryPools.reduce((sum, pool) => sum + pool.totalQuantity, 0)
      : 0

    const created = await tx.match.create({
      data: {
        title: input.title,
        tournament: input.tournament ?? null,
        format: source.format,
        matchDate: new Date(input.matchDate),
        startTime: input.startTime,
        venueId: input.venueId,
        status: 'UPCOMING',
        matchAdminId: session.userId,
        totalInventory,
        notes: source.notes,
        restrictions: source.restrictions,
        operationalInstructions: source.operationalInstructions,
      },
    })

    const categoryIdByName = new Map<string, string>()
    if (input.copyCategories) {
      for (const category of source.ticketCategories) {
        const cloned = await tx.ticketCategory.create({
          data: {
            matchId: created.id, name: category.name, displayName: category.displayName,
            description: category.description, pricingTier: category.pricingTier,
            sortOrder: category.sortOrder, colorCode: category.colorCode, isActive: true,
          },
        })
        categoryIdByName.set(category.name, cloned.id)
      }
    }

    if (input.copyInventory) {
      for (const pool of source.inventoryPools) {
        const ticketCategoryId = categoryIdByName.get(pool.ticketCategory.name)
        if (!ticketCategoryId) continue
        await tx.inventoryPool.create({
          data: {
            matchId: created.id, ticketCategoryId,
            standName: pool.standName, blockName: pool.blockName, gateName: pool.gateName,
            rowStart: pool.rowStart, rowEnd: pool.rowEnd, seatStart: pool.seatStart, seatEnd: pool.seatEnd,
            ticketFormat: pool.ticketFormat, faceValue: pool.faceValue, pricingCategory: pool.pricingCategory,
            totalQuantity: pool.totalQuantity, availableQuantity: pool.totalQuantity,
            reservedQuantity: 0, allocatedQuantity: 0, issuedQuantity: 0, returnedQuantity: 0, voidQuantity: 0,
            isQuotaPool: pool.isQuotaPool, notes: pool.notes,
          },
        })
      }
    }

    if (input.copyQuotas) {
      for (const quota of source.quotaPools) {
        const totalAllocation = quota.quotaAllocations.reduce((sum, allocation) => sum + allocation.allocatedQuantity, 0)
        await tx.quotaPool.create({
          data: {
            matchId: created.id, name: quota.name, displayName: quota.displayName,
            description: quota.description, ownerId: quota.ownerId, totalAllocation, consumedQuantity: 0, isActive: true,
            quotaAllocations: { create: quota.quotaAllocations.flatMap((allocation) => {
              const ticketCategoryId = categoryIdByName.get(allocation.ticketCategory.name)
              return ticketCategoryId ? [{ ticketCategoryId, allocatedQuantity: allocation.allocatedQuantity }] : []
            }) },
          },
        })
      }
    }

    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: created.id, entityType: 'MATCH', entityId: created.id, action: 'CREATE',
      newValues: JSON.stringify({
        title: created.title, replicatedFrom: source.id, sourceTitle: source.title,
        categories: categoryIdByName.size, inventoryPools: input.copyInventory ? source.inventoryPools.length : 0,
        quotaPools: input.copyQuotas ? source.quotaPools.length : 0,
      }),
      changedFields: ['title', 'matchDate', 'venueId'],
    } })
    return { status: 201 as const, match: created, categories: categoryIdByName.size }
  })

  if (result.status === 404) return NextResponse.json({ error: 'Source match not found' }, { status: 404 })
  if (result.status === 422) return NextResponse.json({ error: result.message }, { status: 422 })
  return NextResponse.json({ success: true, match: result.match, categories: result.categories }, { status: 201 })
})
