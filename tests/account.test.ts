import { NextRequest } from 'next/server'
import { hashSync } from 'bcryptjs'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  sessionToken: { deleteMany: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}
const cookieStore = { get: jest.fn(), set: jest.fn(), delete: jest.fn() }

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => cookieStore) }))
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { GET as profileGet, PATCH as profilePatch } from '../src/app/api/account/profile/route'
import { POST as passwordPost } from '../src/app/api/account/password/route'
import { POST as resetPassword } from '../src/app/api/admin/users/[id]/reset-password/route'
import { verifySessionToken } from '../src/lib/auth-core'
import { passwordRateLimiter } from '../src/lib/auth-security'

function authenticatedAs(session: SessionPayload | null): void {
  getSessionMock.mockResolvedValue(session)
}

const operator: SessionPayload = {
  userId: 'user-1', email: 'operator@example.test', fullName: 'Test Operator',
  roles: ['OPERATOR'], permissions: ['requests:read'],
}
const administrator: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Administrator',
  roles: ['SUPER_ADMIN'], permissions: ['users:write'],
}
const currentProfile = {
  id: 'user-1', email: 'operator@example.test', fullName: 'Test Operator',
  mobileNumber: '+919876500001', designation: 'Operator', department: 'Operations',
  employeeId: 'ACA-001', isActive: true, passwordHash: hashSync('old-password-1234', 4),
}

function request(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function project<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return row
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) as Partial<T>
}

beforeEach(() => {
  passwordRateLimiter.succeed('user-1')
  passwordRateLimiter.succeed('admin-reset:admin-1')
  authenticatedAs(operator)
  prismaMock.user.findUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => project(currentProfile, select))
  prismaMock.user.update.mockImplementation(async ({ select }) => {
    const result = { ...currentProfile, fullName: 'Updated Name', designation: 'Coordinator', department: 'Cricket', mobileNumber: '+919876500099' }
    if (!select) return result
    return Object.fromEntries(Object.keys(select).map((key) => [key, result[key as keyof typeof result]]))
  })
  prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.sessionToken.deleteMany.mockResolvedValue({ count: 1 })
})

describe('own profile editing', () => {
  it('requires an authenticated session', async () => {
    authenticatedAs(null)
    const response = await profilePatch(request('/api/account/profile', { fullName: 'Updated Name' }))
    expect(response.status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('returns 404 when the current account no longer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    expect((await profileGet(request('/api/account/profile'))).status).toBe(404)
    expect((await profilePatch(request('/api/account/profile', { fullName: 'Updated Name' }))).status).toBe(404)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('supports clearing optional profile fields', async () => {
    const response = await profilePatch(request('/api/account/profile', { fullName: 'Updated Name', mobileNumber: '', designation: '', department: '' }))
    expect(response.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { fullName: 'Updated Name', mobileNumber: null, designation: null, department: null } }))
  })

  it('returns only safe editable profile fields', async () => {
    const response = await profileGet(request('/api/account/profile'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.profile).toMatchObject({ fullName: 'Test Operator', designation: 'Operator', department: 'Operations' })
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain('mfaSecret')
  })

  it('updates name, designation, department and mobile while preserving the audit trail', async () => {
    const response = await profilePatch(request('/api/account/profile', {
      fullName: ' Updated Name ', designation: 'Coordinator', department: 'Cricket', mobileNumber: '+919876500099',
    }))
    expect(response.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { fullName: 'Updated Name', designation: 'Coordinator', department: 'Cricket', mobileNumber: '+919876500099' },
    }))
    expect(prismaMock.user.update.mock.calls[0][0].data.passwordHash).toBeUndefined()
    expect(prismaMock.auditEvent.create.mock.calls[0][0].data).toMatchObject({ userId: 'user-1', action: 'PROFILE_UPDATE' })
    expect(JSON.stringify(prismaMock.auditEvent.create.mock.calls[0][0])).not.toContain('password')
  })

  it('rejects malformed or privileged profile changes without writing', async () => {
    for (const input of [
      { fullName: 'A' }, { fullName: 'Valid Name', mobileNumber: 'bad' },
      { fullName: 'Valid Name', isActive: false }, { fullName: 'Valid Name', email: 'attacker@example.test' },
    ]) {
      const response = await profilePatch(request('/api/account/profile', input))
      expect(response.status).toBe(400)
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('does not disclose whether a mobile number belongs to another account', async () => {
    prismaMock.user.update.mockRejectedValue({ code: 'P2002', meta: { target: ['mobileNumber'] } })
    const response = await profilePatch(request('/api/account/profile', { fullName: 'Valid Name', mobileNumber: '+919876500099' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('That mobile number is already in use')
  })
})

describe('own password change', () => {
  const body = { currentPassword: 'old-password-1234', newPassword: 'new-password-5678', confirmPassword: 'new-password-5678' }

  it('requires the current password and revokes every session after changing it', async () => {
    const response = await passwordPost(request('/api/account/password', body))
    expect(response.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' }, data: { passwordHash: expect.any(String) } }))
    expect(prismaMock.user.update.mock.calls[0][0].data.passwordHash).not.toBe(body.newPassword)
    expect(prismaMock.sessionToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(prismaMock.auditEvent.create.mock.calls[0][0].data.action).toBe('PASSWORD_CHANGE')
    expect(JSON.stringify(prismaMock.auditEvent.create.mock.calls[0][0])).not.toContain(body.newPassword)
    expect(cookieStore.delete).toHaveBeenCalledWith('aca-ticketops-session')
  })

  it('rejects a wrong current password without changing the hash or sessions', async () => {
    const response = await passwordPost(request('/api/account/password', { ...body, currentPassword: 'incorrect-password' }))
    expect(response.status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.sessionToken.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses a deactivated account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...currentProfile, isActive: false })
    expect((await passwordPost(request('/api/account/password', body))).status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('throttles repeated current-password failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await passwordPost(request('/api/account/password', { ...body, currentPassword: 'incorrect-password' }))
    }
    const response = await passwordPost(request('/api/account/password', body))
    expect(response.status).toBe(429)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('enforces strong new passwords, confirmation, and a different password', async () => {
    for (const input of [
      { ...body, newPassword: 'short', confirmPassword: 'short' },
      { ...body, confirmPassword: 'different-password' },
      { ...body, newPassword: body.currentPassword, confirmPassword: body.currentPassword },
    ]) {
      const response = await passwordPost(request('/api/account/password', input))
      expect(response.status).toBe(400)
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('administrator password reset', () => {
  const context = { params: Promise.resolve({ id: 'user-1' }) }

  it('requires users:write and never returns the password or hash', async () => {
    const forbidden = await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }), context)
    expect(forbidden.status).toBe(403)
    authenticatedAs(administrator)
    const response = await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }), context)
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain('password')
    expect(prismaMock.sessionToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(prismaMock.auditEvent.create.mock.calls[0][0].data.action).toBe('PASSWORD_RESET')
    expect(JSON.stringify(prismaMock.auditEvent.create.mock.calls[0][0])).not.toContain('new-password')
  })

  it('returns 404 for a missing account and requires a 16-character reset password', async () => {
    authenticatedAs(administrator)
    prismaMock.user.findUnique.mockResolvedValue(null)
    const missing = await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }), context)
    expect(missing.status).toBe(404)
    const invalid = await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'short' }), context)
    expect(invalid.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('leaves sessions valid when password hashing fails', async () => {
    authenticatedAs(administrator)
    const error = new Error('Hashing failed')
    prismaMock.user.update.mockRejectedValue(error)
    await expect(resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }), context)).resolves.toMatchObject({ status: 500 })
    expect(prismaMock.sessionToken.deleteMany).not.toHaveBeenCalled()
  })

  it('requires an active target and directs self-service changes to the profile', async () => {
    authenticatedAs(administrator)
    const self = await resetPassword(request('/api/admin/users/admin-1/reset-password', { newPassword: 'new-password-5678' }), { params: Promise.resolve({ id: 'admin-1' }) })
    expect(self.status).toBe(400)
    prismaMock.user.findUnique.mockResolvedValue({ ...currentProfile, isActive: false })
    expect((await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }), context)).status).toBe(400)
    expect((await resetPassword(request('/api/admin/users/user-1/reset-password', { newPassword: 'new-password-5678' }))).status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('session cookie invalidation', () => {
  it('does not accept an unsigned forged session token', async () => {
    await expect(verifySessionToken('not-a-jwt')).resolves.toBeNull()
  })
})
