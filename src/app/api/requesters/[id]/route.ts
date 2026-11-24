import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission, hasRole } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

interface Context { params: Promise<{ id: string }> }

const requesterUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  mobileNumber: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,17}$/, 'Enter a valid mobile number').optional(),
  email: z.string().trim().max(254).email('Enter a valid email address').or(z.literal('')).optional(),
  designation: z.string().trim().max(150).nullish(),
  organisationId: z.string().trim().min(1).nullish(),
  requesterCategory: z.string().trim().min(1).max(100).optional(),
  protocolLevel: z.number().int().min(0).max(10).optional(),
  contactPreference: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']).optional(),
  specialInstructions: z.string().trim().max(2000).nullish(),
  internalNotes: z.string().trim().max(2000).nullish(),
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required')

export const PATCH = withApiHandler<Context>(async (request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Requester ID required' }, { status: 400 })
  if (!hasPermission(session.permissions, 'requests:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = z.string().min(1).max(200).parse((await context.params).id)
  const input = requesterUpdateSchema.parse(await request.json())
  const current = await prisma.requester.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Requester not found' }, { status: 404 })
  try {
    const requester = await prisma.$transaction(async (tx) => {
      const updated = await tx.requester.update({ where: { id }, data: {
        ...input,
        email: input.email === '' ? null : input.email,
        organisationId: input.organisationId === '' ? null : input.organisationId,
      } })
      await tx.auditEvent.create({ data: {
        userId: session.userId, entityType: 'REQUESTER', entityId: id, action: 'UPDATE',
        oldValues: JSON.stringify({ fullName: current.fullName, isActive: current.isActive }),
        newValues: JSON.stringify({ fullName: updated.fullName, isActive: updated.isActive }),
        changedFields: Object.keys(input),
      } })
      return updated
    })
    return NextResponse.json({ success: true, requester })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A requester with this mobile number already exists for the organisation' }, { status: 409 })
    }
    throw error
  }
})

export const DELETE = withApiHandler<Context>(async (_request, session, context) => {
  if (!context) return NextResponse.json({ error: 'Requester ID required' }, { status: 400 })
  if (!hasRole(session.roles, 'SUPER_ADMIN')) return NextResponse.json({ error: 'Only a super administrator can delete records' }, { status: 403 })
  const id = z.string().min(1).max(200).parse((await context.params).id)
  const current = await prisma.requester.findUnique({ where: { id }, select: { id: true, fullName: true } })
  if (!current) return NextResponse.json({ error: 'Requester not found' }, { status: 404 })
  const history = await prisma.request.count({ where: { requesterId: id } })
  if (history > 0) {
    return NextResponse.json({ error: 'This requester has request history. Deactivate the requester instead to preserve the audit trail.' }, { status: 409 })
  }
  await prisma.$transaction(async (tx) => {
    await tx.requester.delete({ where: { id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'REQUESTER', entityId: id, action: 'DELETE',
      oldValues: JSON.stringify(current), changedFields: ['id', 'fullName'],
    } })
  })
  return NextResponse.json({ success: true })
})
