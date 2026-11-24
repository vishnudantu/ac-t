import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { getSession, hasPermission } from '@/lib/auth'
import {
  assertIssuableAllocations,
  calculateIssuedFulfilmentStatus,
  createBatchSchema,
  distributionActionSchema,
  distributionListQuerySchema,
  issueTicketsSchema,
  LifecycleRuleError,
} from '@/lib/lifecycle-rules'
import { prisma } from '@/lib/prisma'

type Transaction = Prisma.TransactionClient
type IssueInput = z.infer<typeof issueTicketsSchema>
type BatchInput = z.infer<typeof createBatchSchema>
type AllocationWithRelations = Prisma.AllocationItemGetPayload<{
  include: { allocation: true; requestItem: true; inventoryPool: true; ticketCategory: true }
}>

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return responseError('Unauthorized', 401)
  if (!hasPermission(session.permissions, 'distribution:read')) return responseError('Forbidden', 403)

  try {
    const query = distributionListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const where: Prisma.DistributionBatchWhereInput = {
      matchId: query.matchId,
      id: query.batchId,
      status: query.status === 'all' ? undefined : query.status,
    }
    const [batches, total] = await prisma.$transaction([
      prisma.distributionBatch.findMany({
        where,
        include: {
          match: { select: { id: true, title: true, matchDate: true } },
          officer: { select: { id: true, fullName: true } },
          issuances: { orderBy: { issuedAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset,
      }),
      prisma.distributionBatch.count({ where }),
    ])
    return NextResponse.json({ success: true, batches, total })
  } catch (error: unknown) {
    return handleError(error, 'Failed to list distribution batches')
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session) return responseError('Unauthorized', 401)
  if (!hasPermission(session.permissions, 'distribution:write') && !hasPermission(session.permissions, 'distribution:issue')) {
    return responseError('Forbidden', 403)
  }

  try {
    const input = distributionActionSchema.parse(await request.json())
    if (input.action === 'CREATE_BATCH') {
      if (!hasPermission(session.permissions, 'distribution:write')) return responseError('Forbidden', 403)
      const batch = await prisma.$transaction((tx) => createBatch(tx, input, session.userId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      return NextResponse.json({ success: true, batch }, { status: 201 })
    }
    if (!hasPermission(session.permissions, 'distribution:issue')) return responseError('Forbidden', 403)
    const issuances = await prisma.$transaction((tx) => issueAllocations(tx, input, session.userId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true, issuances }, { status: 201 })
  } catch (error: unknown) {
    return handleError(error, 'Failed to process distribution request')
  }
}

async function createBatch(tx: Transaction, input: BatchInput, userId: string) {
  const match = await tx.match.findUnique({ where: { id: input.matchId }, select: { id: true } })
  if (!match) throw new LifecycleRuleError('Match not found', 404)
  const batch = await tx.distributionBatch.create({
    data: {
      batchNumber: `DIST-${new Date().getUTCFullYear()}-${randomUUID()}`,
      matchId: input.matchId, officerId: userId, distributionMethod: input.distributionMethod,
      status: 'PREPARING', notes: input.notes, preparedAt: new Date(),
    },
    include: { match: { select: { id: true, title: true } }, officer: { select: { id: true, fullName: true } } },
  })
  await audit(tx, userId, batch.matchId, 'DISTRIBUTION_BATCH', batch.id, 'CREATE_BATCH', {}, { batchNumber: batch.batchNumber, status: batch.status, distributionMethod: batch.distributionMethod }, input.notes ?? undefined)
  return batch
}

async function issueAllocations(tx: Transaction, input: IssueInput, userId: string) {
  const allocations = await tx.allocationItem.findMany({
    where: { id: { in: input.items.map((item) => item.allocationItemId) } },
    include: { allocation: true, requestItem: true, inventoryPool: true, ticketCategory: true },
  })
  const issued = await tx.ticketIssuance.groupBy({
    by: ['allocationItemId'], where: { allocationItemId: { in: allocations.map((allocation) => allocation.id) }, status: 'ISSUED' }, _sum: { quantity: true },
  })
  const issuedByAllocation = new Map(issued.map((item) => [item.allocationItemId, item._sum.quantity ?? 0]))
  const issuable = allocations.map((allocation) => ({
    id: allocation.id, inventoryPoolId: allocation.inventoryPoolId, allocationStatus: allocation.allocation.status, itemStatus: allocation.status,
    allocatedQuantity: allocation.quantity, alreadyIssuedQuantity: issuedByAllocation.get(allocation.id) ?? 0,
    requestedQuantity: allocation.requestItem.requestedQuantity, approvedQuantity: allocation.requestItem.approvedQuantity,
    availableQuantity: allocation.inventoryPool.availableQuantity, totalQuantity: allocation.inventoryPool.totalQuantity,
    issuedQuantity: allocation.inventoryPool.issuedQuantity, voidQuantity: allocation.inventoryPool.voidQuantity,
  }))
  assertIssuableAllocations(issuable, input.items)
  const batch = await resolveBatch(tx, input, allocations, userId)
  const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]))
  const inventoryRemaining = new Map(allocations.map((allocation) => [allocation.inventoryPoolId, allocation.inventoryPool.availableQuantity]))
  const requestItemIssued = new Map(allocations.map((allocation) => [allocation.requestItemId, allocation.requestItem.issuedQuantity]))
  const requestIds = [...new Set(allocations.map((allocation) => allocation.requestItem.requestId))]
  const requestTotals = new Map<string, { totalIssued: number; totalApproved: number }>()
  for (const requestId of requestIds) {
    const record = await tx.request.findUniqueOrThrow({ where: { id: requestId } })
    requestTotals.set(requestId, { totalIssued: record.totalIssued, totalApproved: record.totalApproved })
  }
  const requestDeltas = new Map<string, number>()
  const allocationDeltas = new Map<string, number>()
  for (const item of input.items) {
    allocationDeltas.set(item.allocationItemId, (allocationDeltas.get(item.allocationItemId) ?? 0) + item.quantity)
  }
  for (const allocation of allocations) {
    const cumulativeIssued = (issuedByAllocation.get(allocation.id) ?? 0) + (allocationDeltas.get(allocation.id) ?? 0)
    const allocationItemUpdate = await tx.allocationItem.updateMany({
      where: { id: allocation.id, status: { in: ['CONFIRMED', 'ISSUED'] }, updatedAt: allocation.updatedAt },
      data: { status: cumulativeIssued >= allocation.quantity ? 'ISSUED' : 'CONFIRMED' },
    })
    if (allocationItemUpdate.count !== 1) throw new LifecycleRuleError('Allocation item changed during issuance; retry', 409)
  }
  const issuances = []
  for (const item of input.items) {
    const allocation = allocationsById.get(item.allocationItemId)
    if (!allocation) throw new LifecycleRuleError('Allocation item not found', 404)
    const availableQuantity = inventoryRemaining.get(allocation.inventoryPoolId) ?? allocation.inventoryPool.availableQuantity
    await decrementInventory(tx, allocation, item.quantity, availableQuantity)
    inventoryRemaining.set(allocation.inventoryPoolId, availableQuantity - item.quantity)
    const issuedBeforeItem = requestItemIssued.get(allocation.requestItemId) ?? allocation.requestItem.issuedQuantity
    const requestItemUpdate = await tx.requestItem.updateMany({
      where: {
        id: allocation.requestItemId,
        issuedQuantity: issuedBeforeItem,
        approvedQuantity: { gte: issuedBeforeItem + item.quantity },
      },
      data: { issuedQuantity: { increment: item.quantity } },
    })
    if (requestItemUpdate.count !== 1) throw new LifecycleRuleError('Request item changed or would exceed its approved quantity; retry', 409)
    requestItemIssued.set(allocation.requestItemId, issuedBeforeItem + item.quantity)
    const requestId = allocation.requestItem.requestId
    requestDeltas.set(requestId, (requestDeltas.get(requestId) ?? 0) + item.quantity)
    if (item.serialNumbers?.length) {
      const serialUpdate = await tx.ticketSerial.updateMany({
        where: { serialNumber: { in: item.serialNumbers }, inventoryPoolId: allocation.inventoryPoolId, status: 'AVAILABLE' },
        data: { status: 'ISSUED', issuedToId: userId, issuedAt: new Date() },
      })
      if (serialUpdate.count !== item.quantity) throw new LifecycleRuleError('One or more ticket serials are unavailable', 409)
    }
    const issuance = await tx.ticketIssuance.create({
      data: {
        issuanceNumber: `ISS-${new Date().getUTCFullYear()}-${randomUUID()}`,
        batchId: batch.id, allocationItemId: allocation.id, matchId: allocation.allocation.matchId,
        requestId: allocation.requestItem.requestId, requestItemId: allocation.requestItemId, distributedById: userId,
        distributionMethod: item.distributionMethod ?? input.distributionMethod ?? batch.distributionMethod,
        quantity: item.quantity, ticketCategory: allocation.ticketCategory.displayName,
        standName: allocation.standName, blockName: item.seatDetails ?? allocation.blockName,
        seatDetails: item.seatDetails ?? allocation.seatDetails, serialNumbers: item.serialNumbers ?? [],
        recipientName: item.recipientName, recipientMobile: item.recipientMobile,
        recipientIdType: item.recipientIdType, recipientIdNumber: item.recipientIdNumber,
        recipientSignature: item.recipientSignature, acknowledgementRef: item.acknowledgementRef,
        notes: item.notes ?? input.notes,
      },
    })
    issuances.push(issuance)
  }
  for (const [requestId, delta] of requestDeltas) {
    const current = requestTotals.get(requestId)
    if (!current) throw new LifecycleRuleError('Request not found', 404)
    const totalIssued = current.totalIssued + delta
    const fulfilmentStatus = calculateIssuedFulfilmentStatus(totalIssued, current.totalApproved)
    const updated = await tx.request.updateMany({
      where: { id: requestId, totalIssued: current.totalIssued },
      data: { totalIssued, fulfilmentStatus, version: { increment: 1 } },
    })
    if (updated.count !== 1) throw new LifecycleRuleError('Request changed during issuance; retry', 409)
  }
  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0)
  const batchTotal = await tx.ticketIssuance.aggregate({ where: { batchId: batch.id, status: 'ISSUED' }, _sum: { quantity: true } })
  const batchUpdate = await tx.distributionBatch.updateMany({
    where: { id: batch.id, issuedTickets: batch.issuedTickets },
    data: { issuedTickets: { increment: quantity }, totalTickets: batchTotal._sum.quantity ?? 0, status: 'IN_PROGRESS', startedAt: batch.startedAt ?? new Date() },
  })
  if (batchUpdate.count !== 1) throw new LifecycleRuleError('Distribution batch changed during issuance; retry', 409)
  await audit(tx, userId, batch.matchId, 'DISTRIBUTION_BATCH', batch.id, 'ISSUE', {}, { issuanceIds: issuances.map((issuance) => issuance.id), quantity }, input.notes ?? undefined)
  return issuances
}

async function resolveBatch(tx: Transaction, input: IssueInput, allocations: AllocationWithRelations[], userId: string) {
  const matchIds = new Set(allocations.map((allocation) => allocation.allocation.matchId))
  if (matchIds.size !== 1) throw new LifecycleRuleError('An issuance must belong to a single match', 400)
  const matchId = allocations[0]?.allocation.matchId
  if (!matchId) throw new LifecycleRuleError('Allocation item not found', 404)
  if (input.batchId) {
    const batch = await tx.distributionBatch.findUnique({ where: { id: input.batchId } })
    if (!batch) throw new LifecycleRuleError('Distribution batch not found', 404)
    if (batch.matchId !== matchId) throw new LifecycleRuleError('Distribution batch must belong to the allocation match', 400)
    if (['COMPLETED', 'CANCELLED'].includes(batch.status)) throw new LifecycleRuleError('Distribution batch is closed', 409)
    return batch
  }
  const batch = await tx.distributionBatch.create({
    data: {
      batchNumber: `DIST-${new Date().getUTCFullYear()}-${randomUUID()}`,
      matchId, officerId: userId, distributionMethod: input.distributionMethod ?? 'PHYSICAL', status: 'PREPARING', notes: input.notes, preparedAt: new Date(),
    },
  })
  await audit(tx, userId, matchId, 'DISTRIBUTION_BATCH', batch.id, 'CREATE_BATCH', {}, { batchNumber: batch.batchNumber }, input.notes ?? undefined)
  return batch
}

async function decrementInventory(tx: Transaction, allocation: AllocationWithRelations, quantity: number, availableQuantity: number) {
  const pool = allocation.inventoryPool
  const updated = await tx.inventoryPool.updateMany({
    where: {
      id: pool.id, availableQuantity,
      totalQuantity: { gte: pool.issuedQuantity + pool.voidQuantity + quantity },
    },
    data: { availableQuantity: { decrement: quantity }, issuedQuantity: { increment: quantity } },
  })
  if (updated.count !== 1) throw new LifecycleRuleError('Insufficient inventory availability or concurrent inventory update', 409)
}

async function audit(tx: Transaction, userId: string, matchId: string, entityType: string, entityId: string, action: string, oldValues: object, newValues: object, reason?: string) {
  await tx.auditEvent.create({ data: { userId, matchId, entityType, entityId, action, oldValues: JSON.stringify(oldValues), newValues: JSON.stringify(newValues), changedFields: Object.keys(newValues), reason } })
}

function handleError(error: unknown, fallback: string): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ success: false, error: 'Invalid request data', details: error.flatten() }, { status: 400 })
  if (error instanceof SyntaxError) return responseError('Request body must be valid JSON', 400)
  if (error instanceof LifecycleRuleError) return responseError(error.message, error.status)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return responseError('Concurrent update detected; retry the request', 409)
  console.error(fallback, error)
  return responseError('Internal server error', 500)
}

function responseError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}
