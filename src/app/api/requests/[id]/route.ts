import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }
const requestIdSchema = z.string().trim().min(1).max(100)

export const GET = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'requests:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = requestIdSchema.parse((await context.params).id)
  const requestRecord = await prisma.request.findUnique({
    where: { id },
    include: {
      match: { include: { venue: { select: { id: true, name: true, city: true, state: true } } } },
      requester: { include: { organisation: { select: { id: true, name: true, category: true } } } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      assignedTo: { select: { id: true, fullName: true, email: true } },
      items: {
        include: { ticketCategory: { select: { id: true, name: true, displayName: true } } },
        orderBy: { ticketCategory: { sortOrder: 'asc' } },
      },
      _count: { select: { attachments: true, comments: true, approvalSteps: true } },
    },
  })
  if (!requestRecord) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  return NextResponse.json({ request: requestRecord })
})

const requestUpdateSchema = z.object({
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'PROTOCOL']).optional(),
  sourceReference: z.string().trim().max(200).nullish(),
  requiredDeliveryMethod: z.enum(['PHYSICAL', 'DIGITAL', 'BOTH']).nullish(),
  preferredStand: z.string().trim().max(200).nullish(),
  preferredType: z.string().trim().max(200).nullish(),
  purpose: z.string().trim().max(2000).nullish(),
  specialInstructions: z.string().trim().max(2000).nullish(),
  internalNotes: z.string().trim().max(2000).nullish(),
  assignedToId: z.string().trim().min(1).nullish(),
  items: z.array(z.object({
    ticketCategoryId: z.string().trim().min(1),
    requestedQuantity: z.number().int().positive().max(1_000_000),
    preferredStand: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  }).strict()).min(1).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'requests:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = requestIdSchema.parse((await context.params).id)
  const input = requestUpdateSchema.parse(await request.json())

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.request.findUnique({ where: { id }, select: { id: true, matchId: true, status: true, assignedToId: true, version: true } })
    if (!current) return { status: 404 as const }
    const editable = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PARTIALLY_APPROVED'].includes(current.status)
    if (!editable) return { status: 409 as const, message: `A ${current.status.toLowerCase().replace('_', ' ')} request cannot be edited` }
    if (current.status !== 'DRAFT') {
      const activeAllocations = await tx.allocation.count({ where: { requestId: id, status: { notIn: ['RELEASED', 'CANCELLED'] } } })
      if (activeAllocations > 0) return { status: 409 as const, message: 'Requests with active allocations cannot be edited' }
    }
    if (input.assignedToId) {
      const assignee = await tx.user.findUnique({ where: { id: input.assignedToId }, select: { isActive: true } })
      if (!assignee?.isActive) return { status: 422 as const, message: 'Assigned user is not active' }
    }
    if (input.items) {
      const request = await tx.request.findUnique({ where: { id }, select: { requesterId: true } })
      if (!request) return { status: 404 as const }
      const categories = await tx.ticketCategory.findMany({ where: { id: { in: input.items.map((item) => item.ticketCategoryId) } }, select: { id: true, matchId: true, isActive: true } })
      if (categories.length !== new Set(input.items.map((item) => item.ticketCategoryId)).size || categories.some((category) => category.matchId !== current.matchId || !category.isActive)) {
        return { status: 422 as const, message: 'Every category must be active and belong to the match' }
      }
      await tx.requestItem.deleteMany({ where: { requestId: id } })
      await tx.requestItem.createMany({ data: input.items.map((item) => ({
        requestId: id, ticketCategoryId: item.ticketCategoryId, requestedQuantity: item.requestedQuantity,
        preferredStand: item.preferredStand ?? null, notes: item.notes ?? null, requesterId: request.requesterId,
      })) })
    }
    const totalRequested = input.items
      ? input.items.reduce((sum, item) => sum + item.requestedQuantity, 0)
      : undefined
    const updated = await tx.request.update({ where: { id }, data: {
      priority: input.priority,
      sourceReference: input.sourceReference,
      requiredDeliveryMethod: input.requiredDeliveryMethod,
      preferredStand: input.preferredStand,
      preferredType: input.preferredType,
      purpose: input.purpose,
      specialInstructions: input.specialInstructions,
      internalNotes: input.internalNotes,
      assignedToId: input.assignedToId,
      ...(totalRequested === undefined ? {} : { totalRequested }),
      version: { increment: 1 },
    }, include: { items: { include: { ticketCategory: true } }, requester: true, match: true } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, matchId: current.matchId, entityType: 'REQUEST', entityId: id, action: 'UPDATE',
      oldValues: JSON.stringify({ status: current.status, assignedToId: current.assignedToId }),
      newValues: JSON.stringify({ status: updated.status, totalRequested: updated.totalRequested }),
      changedFields: Object.keys(input),
    } })
    return { status: 200 as const, request: updated }
  })
  if (updated.status === 404) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (updated.status === 409) return NextResponse.json({ error: updated.message }, { status: 409 })
  if (updated.status === 422) return NextResponse.json({ error: updated.message }, { status: 422 })
  return NextResponse.json({ success: true, request: updated.request })
})

/**
 * Super administrators may delete a request. Its items, comments, attachments,
 * reminders, approval steps and decisions, and audit events are removed with it.
 */
export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Only a super administrator can delete a request' }, { status: 403 })
  }
  const id = requestIdSchema.parse((await context.params).id)
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.request.findUnique({ where: { id }, select: { id: true, matchId: true, requestNumber: true } })
    if (!current) return { status: 404 as const }
    const activeAllocations = await tx.allocation.count({ where: { requestId: id, status: { notIn: ['RELEASED', 'CANCELLED'] } } })
    if (activeAllocations > 0) return { status: 409 as const }
    await tx.auditEvent.deleteMany({ where: { entityType: 'REQUEST', entityId: id } })
    await tx.request.delete({ where: { id } })
    return { status: 200 as const, requestNumber: current.requestNumber }
  })
  if (result.status === 404) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (result.status === 409) return NextResponse.json({ error: 'Release the allocations before deleting this request' }, { status: 409 })
  return NextResponse.json({ success: true, deleted: { requestNumber: result.requestNumber } })
})
