import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { generateRequestNumber } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole, type SessionPayload } from '@/lib/auth'
import { withApiHandler, ApiError } from '@/lib/api'
import { requestCreateSchema, requestListQuerySchema } from '@/lib/validation'
import { apiError } from '@/lib/api-core'
import { MAX_REQUEST_ITEMS } from '@/lib/lifecycle-rules'
import { ensureApprovalWorkflow } from '@/lib/approval-workflow'

export const GET = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'requests:read')) return apiError('Forbidden', 403)
  const query = requestListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const where: Prisma.RequestWhereInput = {
    matchId: query.matchId,
    status: query.status !== 'all' ? query.status : undefined,
    requesterId: query.requesterId,
    assignedToId: query.assignedToId,
    ...(query.search ? { OR: [
      { requestNumber: { contains: query.search, mode: 'insensitive' } },
      { requester: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { requester: { mobileNumber: { contains: query.search } } },
      { requester: { email: { contains: query.search, mode: 'insensitive' } } },
    ] } : {}),
  }
  const [requests, total] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      include: {
        match: { select: { id: true, title: true, matchDate: true } },
        requester: { select: { id: true, fullName: true, mobileNumber: true, email: true, organisation: { select: { name: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        assignedTo: { select: { id: true, fullName: true } },
        items: { include: { ticketCategory: { select: { id: true, name: true, displayName: true } } } },
        _count: { select: { attachments: true, comments: true, approvalSteps: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.request.count({ where }),
  ])
  return NextResponse.json({ success: true, requests, total })
})

export const POST = withApiHandler(async (request: NextRequest, session: SessionPayload) => {
  if (!hasPermission(session.permissions, 'requests:write')) return apiError('Forbidden', 403)
  const data = requestCreateSchema.parse(await request.json())
  if (data.items.length > MAX_REQUEST_ITEMS) return apiError(`A request cannot contain more than ${MAX_REQUEST_ITEMS} items`, 400)
  if (new Set(data.items.map((item) => item.ticketCategoryId)).size !== data.items.length) {
    return apiError('Duplicate ticket categories are not allowed in a request', 400)
  }
  if (data.assignedToId && !hasPermission(session.permissions, 'requests:assign')) {
    return apiError('You do not have permission to assign requests', 403)
  }
  const created = await prisma.$transaction(async (tx) => {
    const [match, requester, categories] = await Promise.all([
      tx.match.findUnique({ where: { id: data.matchId }, select: { id: true, status: true } }),
      tx.requester.findUnique({ where: { id: data.requesterId }, select: { id: true, isActive: true } }),
      tx.ticketCategory.findMany({ where: { id: { in: data.items.map((item) => item.ticketCategoryId) } }, select: { id: true, matchId: true, isActive: true } }),
    ])
    if (!match || match.status === 'CANCELLED' || match.status === 'COMPLETED') throw new ApiError(422, 'Match is not accepting requests')
    if (!requester?.isActive) throw new ApiError(422, 'Requester is not active')
    if (categories.length !== new Set(data.items.map((item) => item.ticketCategoryId)).size || categories.some((category) => category.matchId !== data.matchId || !category.isActive)) {
      throw new ApiError(422, 'Every category must be active and belong to the selected match')
    }
    if (data.assignedToId) {
      const assignedTo = await tx.user.findUnique({ where: { id: data.assignedToId }, select: { isActive: true } })
      if (!assignedTo?.isActive) throw new ApiError(422, 'Assigned user is not active')
    }
    // Duplicate detection: same requester, match and category in an open request.
    const duplicates = await tx.request.findMany({
      where: {
        requesterId: data.requesterId,
        matchId: data.matchId,
        status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED'] },
        items: { some: { ticketCategoryId: { in: data.items.map((item) => item.ticketCategoryId) } } },
      },
      select: { id: true, requestNumber: true, status: true, items: { select: { ticketCategoryId: true } } },
      take: 5,
    })
    if (duplicates.length > 0 && !hasRole(session.roles, ['SUPER_ADMIN', 'APPROVAL_AUTHORITY', 'MATCH_ADMIN'])) {
      const list = duplicates.map((duplicate) => duplicate.requestNumber).join(', ')
      throw new ApiError(409, `A similar request already exists for this requester, match and category: ${list}. Review the existing request before submitting another.`)
    }
    const workflow = data.status === 'SUBMITTED' ? await ensureApprovalWorkflow(tx, data.matchId) : null
    if (data.status === 'SUBMITTED' && !workflow) {
      throw new ApiError(422, 'No active approver role is available for this match. Ask an administrator to seed roles or configure a workflow.')
    }
    const requestNumber = generateRequestNumber()
    const newRequest = await tx.request.create({
      data: {
        requestNumber,
        matchId: data.matchId,
        requesterId: data.requesterId,
        createdById: session.userId,
        assignedToId: data.assignedToId,
        source: data.source,
        sourceReference: data.sourceReference,
        priority: data.priority,
        protocolClassification: data.protocolClassification,
        status: data.status === 'SUBMITTED' ? 'UNDER_REVIEW' : data.status,
        fulfilmentStatus: 'PENDING',
        requiredDeliveryMethod: data.requiredDeliveryMethod,
        preferredStand: data.preferredStand,
        preferredType: data.preferredType,
        purpose: data.purpose,
        specialInstructions: data.specialInstructions,
        internalNotes: data.internalNotes,
        submittedAt: data.status === 'SUBMITTED' ? new Date() : null,
        totalRequested: data.items.reduce((sum, item) => sum + item.requestedQuantity, 0),
        items: { create: data.items.map((item) => ({ ...item, requesterId: item.requesterId || data.requesterId })) },
      },
      include: { items: { include: { ticketCategory: true } }, requester: true, match: true },
    })
    if (workflow) {
      await tx.approvalStep.createMany({ data: workflow.steps.map((step, index) => ({
        requestId: newRequest.id,
        workflowId: workflow.id,
        stepDefinitionId: step.id,
        stepOrder: step.stepOrder,
        name: step.name,
        status: index === 0 ? 'IN_PROGRESS' : 'PENDING',
        assignedToId: step.approverUserId,
        assignedRoleId: step.approverRoleId,
        startedAt: index === 0 ? new Date() : null,
        deadlineAt: step.timeoutHours ? new Date(Date.now() + step.timeoutHours * 60 * 60 * 1000) : null,
      })) })
    }
    await tx.auditEvent.create({ data: {
      userId: session.userId,
      matchId: data.matchId,
      entityType: 'REQUEST',
      entityId: newRequest.id,
      action: data.status === 'SUBMITTED' ? 'SUBMIT' : 'CREATE',
      newValues: JSON.stringify({ requestNumber, status: data.status, totalRequested: newRequest.totalRequested }),
      changedFields: ['requestNumber', 'status', 'totalRequested'],
    } })
    return newRequest
  })
  return NextResponse.json({ success: true, ...created }, { status: 201 })
})
