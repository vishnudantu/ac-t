import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { ApiError, withApiHandler } from '@/lib/api'
import { SESSION_COOKIE_NAME } from '@/lib/auth-core'
import { passwordRateLimiter } from '@/lib/auth-security'
import { passwordChangeSchema } from '@/lib/account'

export const POST = withApiHandler(async (request: NextRequest, session) => {
  const input = passwordChangeSchema.parse(await request.json())
  const limit = passwordRateLimiter.check(session.userId)
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: 'Too many password attempts. Try again later.' }, {
      status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' },
    })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true, isActive: true },
  })
  if (!user?.isActive) throw new ApiError(401, 'Your account is not active')
  if (!await verifyPassword(input.currentPassword, user.passwordHash)) {
    passwordRateLimiter.fail(session.userId)
    throw new ApiError(403, 'Current password is incorrect')
  }
  passwordRateLimiter.succeed(session.userId)

  const passwordHash = await hashPassword(input.newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } })
    await tx.sessionToken.deleteMany({ where: { userId: user.id } })
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'USER', entityId: user.id, action: 'PASSWORD_CHANGE',
      changedFields: ['password'],
    } })
  })
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
})
