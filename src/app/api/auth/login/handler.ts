import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSession, verifyPassword } from '@/lib/auth'
import { loginAttemptKey, loginRateLimiter, type AuthRateLimiter } from '@/lib/auth-security'
import { ApiError, errorResponse, parseJsonBody } from '@/lib/api'

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(1024),
}).strict()

export interface LoginDependencies {
  limiter?: AuthRateLimiter
}

export function createLoginHandler({ limiter = loginRateLimiter }: LoginDependencies = {}) {
  return async function login(request: NextRequest): Promise<NextResponse> {
    try {
      const input = loginSchema.parse(await parseJsonBody(request))
      const attemptKey = loginAttemptKey(request, input.email)
      const rateLimit = limiter.check(attemptKey)
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { success: false, error: 'Too many login attempts. Try again later.' },
          { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds), 'Cache-Control': 'no-store' } },
        )
      }

      const user = await prisma.user.findUnique({ where: { email: input.email } })
      const validPassword = user ? await verifyPassword(input.password, user.passwordHash) : false
      if (!user || !user.isActive || !validPassword) {
        limiter.fail(attemptKey)
        return NextResponse.json(
          { success: false, error: 'Invalid email or password' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      if (user.mfaEnabled) {
        return NextResponse.json(
          { success: false, error: 'MFA verification is not available. Contact an administrator.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      await createSession({ userId: user.id })
      limiter.succeed(attemptKey)
      return NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, fullName: user.fullName },
      }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error: unknown) {
      return errorResponse(error instanceof ApiError || error instanceof z.ZodError ? error : new Error('Login failed'))
    }
  }
}
