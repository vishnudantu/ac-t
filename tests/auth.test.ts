import { NextRequest } from 'next/server'
import { SignJWT } from 'jose'
import { hashSync } from 'bcryptjs'

const prismaMock = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  sessionToken: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
}

const cookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => cookieStore) }))

import {
  createSession,
  destroySession,
  getSession,
  getUserWithPermissions,
} from '../src/lib/auth'
import { LoginRateLimiter, safeCallbackPath, verifySessionToken } from '../src/lib/auth-core'
import { POST as login } from '../src/app/api/auth/login/route'
import { createLoginHandler } from '../src/app/api/auth/login/handler'
import { GET as sessionRoute } from '../src/app/api/auth/session/route'
import { POST as logout } from '../src/app/api/auth/logout/route'
import { middleware } from '../src/middleware'

const TEST_SECRET = 'test-only-secret-with-at-least-32-characters'
const TEST_DATE = new Date('2026-11-24T12:00:00.000Z')

const activeUser = {
  id: 'user-1',
  email: 'operator@example.test',
  fullName: 'Test Operator',
  isActive: true,
  mfaEnabled: false,
  passwordHash: 'hashed-password',
  mfaSecret: 'must-not-leak',
  roleAssignments: [{
    role: {
      name: 'OPERATOR',
      isActive: true,
      permissions: [{ permission: { key: 'matches:read' } }],
    },
  }],
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost${path}`, init)
}

async function signedToken(payload: object, secret = TEST_SECRET): Promise<string> {
  return new SignJWT({ sid: 'session-1', ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti('session-1')
    .setExpirationTime('24h')
    .sign(new TextEncoder().encode(secret))
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TEST_DATE)
  process.env.JWT_SECRET = TEST_SECRET
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true })
  cookieStore.get.mockReturnValue(undefined)
  prismaMock.user.findUnique.mockResolvedValue(activeUser)
  prismaMock.sessionToken.findUnique.mockResolvedValue({ id: 'session-1', userId: 'user-1', expiresAt: new Date(TEST_DATE.getTime() + 60_000) })
  prismaMock.sessionToken.create.mockResolvedValue({ id: 'session-1' })
  prismaMock.$transaction.mockImplementation(async (operations) => Promise.all(operations))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('revocable server-backed sessions', () => {
  it('issues a minimal JWT and stores only its SHA-256 hash with 24-hour expiry', async () => {
    const token = await createSession({ userId: 'user-1', sessionId: 'session-1' })
    const stored = prismaMock.sessionToken.create.mock.calls[0][0].data

    expect(stored).toMatchObject({ id: 'session-1', userId: 'user-1', expiresAt: new Date(TEST_DATE.getTime() + 86_400_000) })
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stored.tokenHash).not.toBe(token)
    expect(cookieStore.set).toHaveBeenCalledWith('aca-ticketops-session', token, expect.objectContaining({
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 86_400, path: '/',
    }))
    await expect(verifySessionToken(token)).resolves.toEqual({ userId: 'user-1', sessionId: 'session-1' })
  })

  it('rejects a missing or short JWT secret without a development fallback outside development', async () => {
    delete process.env.JWT_SECRET
    await expect(createSession({ userId: 'user-1', sessionId: 'session-1' })).rejects.toThrow('JWT_SECRET')

    process.env.JWT_SECRET = 'too-short'
    await expect(createSession({ userId: 'user-1', sessionId: 'session-1' })).rejects.toThrow('32 characters')
  })

  it('supports an explicitly enabled process-local development secret', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true })
    process.env.ALLOW_EPHEMERAL_DEV_AUTH = 'true'
    delete process.env.JWT_SECRET

    const first = await createSession({ userId: 'user-1', sessionId: 'session-1' })
    await expect(verifySessionToken(first)).resolves.toEqual({ userId: 'user-1', sessionId: 'session-1' })
  })

  it('reloads current GLOBAL permissions and returns an allowlisted session', async () => {
    const token = await signedToken({ sub: 'user-1', sid: 'session-1' })
    cookieStore.get.mockReturnValue({ value: token })

    await expect(getSession()).resolves.toEqual({
      userId: 'user-1', email: 'operator@example.test', fullName: 'Test Operator',
      roles: ['OPERATOR'], permissions: ['matches:read'],
    })
    expect(prismaMock.sessionToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: expect.any(String) } }))
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      include: expect.objectContaining({ roleAssignments: expect.objectContaining({
        where: expect.objectContaining({ isActive: true, scope: 'GLOBAL', matchId: null }),
      }) }),
    }))
  })

  it('rejects forged tokens without querying Prisma', async () => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1', permissions: ['users:write'] }, 'attacker-controlled-signing-key-32-characters') })
    await expect(getSession()).resolves.toBeNull()
    expect(prismaMock.sessionToken.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['revoked', null],
    ['expired', { id: 'session-1', userId: 'user-1', expiresAt: new Date(TEST_DATE.getTime() - 1) }],
  ])('rejects a %s persisted session', async (_case, stored) => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1' }) })
    prismaMock.sessionToken.findUnique.mockResolvedValue(stored)
    await expect(getSession()).resolves.toBeNull()
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['deactivated user', { ...activeUser, isActive: false }],
    ['role revoked', { ...activeUser, roleAssignments: [] }],
    ['role deactivated', { ...activeUser, roleAssignments: [] }],
  ])('reloads and applies a %s on every request', async (_case, currentUser) => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1' }) })
    prismaMock.user.findUnique.mockResolvedValue(currentUser)
    const session = await getSession()
    if (_case === 'deactivated user') expect(session).toBeNull()
    else expect(session).toMatchObject({ roles: [], permissions: [] })
  })

  it('rejects mismatched token subjects and session owners', async () => {
    const token = await signedToken({ sub: 'attacker', sid: 'session-1' })
    cookieStore.get.mockReturnValue({ value: token })
    await expect(getSession()).resolves.toBeNull()
    await expect(verifySessionToken(await signedToken({ sub: 'user-1', sid: undefined }))).resolves.toBeNull()
  })

  it('revokes the stored token and deletes the cookie on logout', async () => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1' }) })
    await destroySession()
    expect(prismaMock.sessionToken.deleteMany).toHaveBeenCalledWith({ where: { id: 'session-1', userId: 'user-1', tokenHash: expect.any(String) } })
    expect(cookieStore.delete).toHaveBeenCalledWith('aca-ticketops-session')
  })
})

describe('GLOBAL role resolution', () => {
  it('uses assignedAt-compatible expiry filters and omits sensitive user fields from session responses', async () => {
    const user = await getUserWithPermissions('user-1')
    expect(user).toMatchObject({ roles: ['OPERATOR'], permissions: ['matches:read'] })
    const assignmentFilter = prismaMock.user.findUnique.mock.calls[0][0].include.roleAssignments.where
    expect(assignmentFilter.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: TEST_DATE } }])
    expect(assignmentFilter.role).toEqual({ isActive: true })
  })
})

describe('auth routes and safe redirects', () => {
  it('accepts only local absolute callback paths', () => {
    expect(safeCallbackPath('/requests?id=1')).toBe('/requests?id=1')
    for (const unsafe of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login', '', null]) {
      expect(safeCallbackPath(unsafe)).toBe('/dashboard')
    }
  })

  it('returns a generic credential error without creating a session or updating lastLoginAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const response = await login(request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'operator@example.test', password: 'wrong' }) }))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Invalid email or password' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.sessionToken.create).not.toHaveBeenCalled()
  })

  it('uses an injected limiter and only updates lastLoginAt after successful authentication', async () => {
    const limiter = { check: jest.fn(() => ({ allowed: true, retryAfterSeconds: 0 })), fail: jest.fn(), succeed: jest.fn() }
    const loginWithLimiter = createLoginHandler({ limiter })
    prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash: hashSync('correct-password', 4) })
    const response = await loginWithLimiter(request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ' Operator@Example.Test ', password: 'correct-password' }),
    }))
    expect(response.status).toBe(200)
    expect(prismaMock.sessionToken.create).toHaveBeenCalled()
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { lastLoginAt: TEST_DATE } })
    expect(limiter.succeed).toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toContain('passwordHash')
  })

  it('does not silently bypass MFA', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, mfaEnabled: true, passwordHash: hashSync('Admin@123', 4) })
    const response = await login(request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'operator@example.test', password: 'Admin@123' }) }))
    expect(response.status).toBe(503)
    expect(prismaMock.sessionToken.create).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('returns a no-store, allowlisted current session', async () => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1' }) })
    const response = await sessionRoute()
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body).toEqual({
      userId: 'user-1', email: 'operator@example.test', fullName: 'Test Operator',
      roles: ['OPERATOR'], permissions: ['matches:read'],
    })
    expect(JSON.stringify(body)).not.toContain('passwordHash')
  })

  it('requires a real persisted session for the session endpoint', async () => {
    const response = await sessionRoute()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('logs out through the auth endpoint', async () => {
    cookieStore.get.mockReturnValue({ value: await signedToken({ sub: 'user-1', sid: 'session-1' }) })
    const response = await logout()
    expect(response.status).toBe(200)
    expect(prismaMock.sessionToken.deleteMany).toHaveBeenCalled()
    expect(cookieStore.delete).toHaveBeenCalled()
  })
})

describe('bounded injectable login throttling', () => {
  it('blocks only after the failure budget and clears on success', () => {
    let now = 0
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 1000, maxEntries: 10, now: () => now })
    expect(limiter.check('user').allowed).toBe(true)
    limiter.fail('user')
    limiter.fail('user')
    expect(limiter.check('user')).toMatchObject({ allowed: false, retryAfterSeconds: 1 })
    limiter.fail('user')
    limiter.succeed('user')
    expect(limiter.check('user').allowed).toBe(true)
    now = 1001
    limiter.fail('user')
    expect(limiter.check('user').allowed).toBe(true)
  })

  it('bounds retained identities and supports injected storage behavior', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 1000, maxEntries: 2 })
    limiter.fail('a')
    limiter.fail('b')
    limiter.fail('c')
    expect(limiter.size).toBeLessThanOrEqual(2)
  })
})

describe('page navigation middleware', () => {
  it('redirects unauthenticated protected pages to a safe local callback', async () => {
    const response = await middleware(request('/requests?status=PENDING'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Frequests%3Fstatus%3DPENDING')
  })

  it('allows public pages and valid signed navigation without treating a forged token as authenticated', async () => {
    expect((await middleware(request('/login'))).status).toBe(200)
    const token = await signedToken({ sub: 'user-1', sid: 'session-1' })
    const valid = request('/dashboard', { headers: { cookie: `aca-ticketops-session=${token}` } })
    expect((await middleware(valid)).status).toBe(200)

    const forged = request('/admin/users', { headers: { cookie: `aca-ticketops-session=${await signedToken({ sub: 'admin', sid: 'fake' }, 'attacker-controlled-signing-key-32-characters')}` } })
    expect((await middleware(forged)).headers.get('location')).toContain('/login?')
  })
})
