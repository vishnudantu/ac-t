import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ApiError, withApiHandler } from '@/lib/api'
import { auditProfileValues, isUniqueConstraintError, profileSelect, profileUpdateSchema } from '@/lib/account'

const noStore = { headers: { 'Cache-Control': 'no-store' } }

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  const profile = await prisma.user.findUnique({ where: { id: session.userId }, select: profileSelect })
  if (!profile) throw new ApiError(404, 'Profile not found')
  return NextResponse.json({ success: true, profile }, noStore)
})

export const PATCH = withApiHandler(async (request: NextRequest, session) => {
  const input = profileUpdateSchema.parse(await request.json())
  const profile = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: session.userId }, select: profileSelect })
    if (!current) throw new ApiError(404, 'Profile not found')
    try {
      const updated = await tx.user.update({ where: { id: session.userId }, data: input, select: profileSelect })
      await tx.auditEvent.create({ data: {
        userId: session.userId, entityType: 'USER', entityId: session.userId, action: 'PROFILE_UPDATE',
        oldValues: auditProfileValues(current), newValues: auditProfileValues(updated),
        changedFields: Object.keys(input),
      } })
      return updated
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(409, 'That mobile number is already in use')
      }
      throw error
    }
  })
  return NextResponse.json({ success: true, profile }, noStore)
})
