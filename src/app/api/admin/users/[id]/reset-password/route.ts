import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, hasPermission } from '@/lib/auth'
import { ApiError, withApiHandler } from '@/lib/api'
import { passwordResetSchema } from '@/lib/account'
import { passwordRateLimiter } from '@/lib/auth-security'

interface Context { params: Promise<{ id: string }> }
const userIdSchema = z.string().trim().min(1).max(200)

export const POST = withApiHandler<Context>(async (request: NextRequest, session, context) => {
  if (!hasPermission(session.permissions, 'users:write')) throw new ApiError(403, 'Forbidden')
  if (!context) throw new ApiError(400, 'User ID is required')
  const userId = userIdSchema.parse((await context.params).id)
  const { newPassword } = passwordResetSchema.parse(await request.json())
  if (userId === session.userId) throw new ApiError(400, 'Use your profile to change your own password')
  const limit = passwordRateLimiter.check(`admin-reset:${session.userId}`)
  if (!limit.allowed) throw new ApiError(429, 'Too many password resets. Try again later.')

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } })
  if (!target) throw new ApiError(404, 'User not found')
  if (!target.isActive) throw new ApiError(400, 'Cannot reset the password of an inactive account')
  passwordRateLimiter.fail(`admin-reset:${session.userId}`)

  const passwordHash = await hashPassword(newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { passwordHash } })
    await tx.sessionToken.deleteMany({ where: { userId: target.id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'USER', entityId: target.id, action: 'PASSWORD_RESET',
      changedFields: ['password'],
    } })
  })
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
})
