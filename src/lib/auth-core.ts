import { jwtVerify } from 'jose'
import { z } from 'zod'

export const SESSION_COOKIE_NAME = 'aca-ticketops-session'
export const SESSION_DURATION_SECONDS = 24 * 60 * 60
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000
export const DEFAULT_CALLBACK_PATH = '/dashboard'

// Middleware bundles only this edge-safe module; server-only auth imports Node crypto and Prisma.
const navigationTokenSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
})

export interface SessionTokenClaims {
  userId: string
  sessionId: string
}

export interface SessionPayload {
  userId: string
  email: string
  fullName: string
  roles: string[]
  permissions: string[]
}

let ephemeralDevelopmentSecret: Uint8Array | undefined

export function getJwtSecret(): Uint8Array {
  const nodeEnvironment = process.env.NODE_ENV
  const configuredSecret = process.env.JWT_SECRET
  if (configuredSecret !== undefined && configuredSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters')
  }
  if (configuredSecret) return new TextEncoder().encode(configuredSecret)

  const allowEphemeralDevelopmentSecret = process.env.ALLOW_EPHEMERAL_DEV_AUTH === 'true'
  if (nodeEnvironment === 'production' || !allowEphemeralDevelopmentSecret) {
    throw new Error(
      'JWT_SECRET must contain at least 32 characters. For local development only, set ALLOW_EPHEMERAL_DEV_AUTH=true to use a process-local random secret.',
    )
  }

  // Restarting this process revokes all development sessions. Production never uses this path.
  if (!ephemeralDevelopmentSecret) {
    const randomValues = new Uint8Array(32)
    crypto.getRandomValues(randomValues)
    ephemeralDevelopmentSecret = randomValues
  }
  return ephemeralDevelopmentSecret
}

export async function verifySessionToken(token: string): Promise<SessionTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'jti', 'exp'],
    })
    const claims = navigationTokenSchema.safeParse(payload)
    return claims.success ? { userId: claims.data.sub, sessionId: claims.data.sid } : null
  } catch {
    return null
  }
}

export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_CALLBACK_PATH
  }
  if (/[\u0000-\u001f\u007f]/.test(value) || value === '/login' || value.startsWith('/login?')) {
    return DEFAULT_CALLBACK_PATH
  }
  return value
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

export interface LoginRateLimiterOptions {
  maxAttempts?: number
  windowMs?: number
  maxEntries?: number
  now?: () => number
}

interface AttemptWindow {
  startedAt: number
  failures: number
  lastSeenAt: number
}

// Local development/single-process protection only. Production needs a shared,
// distributed limiter at the application or edge layer; this is not one.
export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>()
  private readonly maxAttempts: number
  private readonly windowMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: LoginRateLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5
    this.windowMs = options.windowMs ?? 15 * 60 * 1000
    this.maxEntries = options.maxEntries ?? 1000
    this.now = options.now ?? Date.now
  }

  get size(): number {
    return this.attempts.size
  }

  check(key: string): RateLimitResult {
    const attempt = this.getCurrentAttempt(key)
    if (!attempt || attempt.failures < this.maxAttempts) return { allowed: true, retryAfterSeconds: 0 }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((attempt.startedAt + this.windowMs - this.now()) / 1000)),
    }
  }

  fail(key: string): void {
    const now = this.now()
    const attempt = this.getCurrentAttempt(key) ?? { startedAt: now, failures: 0, lastSeenAt: now }
    this.attempts.set(key, { ...attempt, failures: attempt.failures + 1, lastSeenAt: now })
    this.evictOverflow()
  }

  succeed(key: string): void {
    this.attempts.delete(key)
  }

  private getCurrentAttempt(key: string): AttemptWindow | undefined {
    const attempt = this.attempts.get(key)
    if (!attempt) return undefined
    const now = this.now()
    if (now - attempt.startedAt >= this.windowMs) {
      this.attempts.delete(key)
      return undefined
    }
    const currentAttempt = { ...attempt, lastSeenAt: now }
    this.attempts.delete(key)
    this.attempts.set(key, currentAttempt)
    return currentAttempt
  }

  private evictOverflow(): void {
    const now = this.now()
    for (const [key, attempt] of this.attempts) {
      if (now - attempt.startedAt >= this.windowMs) this.attempts.delete(key)
    }
    while (this.attempts.size > this.maxEntries) {
      const oldestKey = this.attempts.keys().next().value
      if (oldestKey === undefined) break
      this.attempts.delete(oldestKey)
    }
  }
}
