import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  match: { findUnique: jest.fn(), delete: jest.fn(), updateMany: jest.fn() },
  ticketCategory: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  quotaPool: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  quotaAllocation: { deleteMany: jest.fn(), createMany: jest.fn() },
  quotaTransfer: { count: jest.fn() },
  inventoryPool: { count: jest.fn() },
  user: { findUnique: jest.fn() },
  auditEvent: { create: jest.fn(), deleteMany: jest.fn() },
  importJob: { deleteMany: jest.fn() },
  exportJob: { deleteMany: jest.fn() },
  roleAssignment: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { DELETE as deleteMatch } from '../src/app/api/matches/[id]/route'
import { POST as addCategory } from '../src/app/api/matches/[id]/categories/route'
import { PATCH as patchQuota } from '../src/app/api/quotas/[id]/route'

const superAdmin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Super Admin',
  roles: ['SUPER_ADMIN'], permissions: ['matches:write', 'matches:configure', 'quotas:write'],
}
const matchAdmin: SessionPayload = {
  userId: 'user-2', email: 'match@example.test', fullName: 'Match Admin',
  roles: ['MATCH_ADMIN'], permissions: ['matches:write', 'quotas:write'],
}

function request(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(superAdmin)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', title: 'Test Match' })
  prismaMock.match.delete.mockResolvedValue({ id: 'match-1', title: 'Test Match' })
  prismaMock.ticketCategory.create.mockResolvedValue({ id: 'cat-1', name: 'PREMIUM', displayName: 'Premium' })
  prismaMock.quotaPool.findUnique.mockResolvedValue({ id: 'quota-1', matchId: 'match-1', name: 'ACA', displayName: 'ACA Officials', totalAllocation: 100, isActive: true, quotaAllocations: [] })
  prismaMock.quotaPool.update.mockResolvedValue({ id: 'quota-1', matchId: 'match-1', displayName: 'ACA Updated', totalAllocation: 100, isActive: false })
})

describe('super-admin match deletion', () => {
  it('rejects a match administrator', async () => {
    getSessionMock.mockResolvedValue(matchAdmin)
    expect((await deleteMatch(request(), context('match-1'))).status).toBe(403)
    expect(prismaMock.match.delete).not.toHaveBeenCalled()
  })

  it('deletes the match with its dependent records for a super administrator', async () => {
    const response = await deleteMatch(request(), context('match-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.auditEvent.deleteMany).toHaveBeenCalledWith({ where: { matchId: 'match-1' } })
    expect(prismaMock.importJob.deleteMany).toHaveBeenCalledWith({ where: { matchId: 'match-1' } })
    expect(prismaMock.exportJob.deleteMany).toHaveBeenCalledWith({ where: { matchId: 'match-1' } })
    expect(prismaMock.roleAssignment.deleteMany).toHaveBeenCalledWith({ where: { matchId: 'match-1' } })
    expect(prismaMock.match.updateMany).toHaveBeenCalledWith({ where: { clonedFromMatchId: 'match-1' }, data: { clonedFromMatchId: null } })
    expect(prismaMock.match.delete).toHaveBeenCalledWith({ where: { id: 'match-1' } })
  })

  it('returns 404 for a missing match', async () => {
    prismaMock.match.findUnique.mockResolvedValue(null)
    expect((await deleteMatch(request(), context('match-1'))).status).toBe(404)
  })
})

describe('ticket category creation', () => {
  it('adds a category to a match with an audit event', async () => {
    const response = await addCategory(request({ name: 'Premium', displayName: 'Premium', pricingTier: 2, sortOrder: 3, colorCode: '#1e3a8a' }), context('match-1'))
    expect(response.status).toBe(201)
    expect(prismaMock.ticketCategory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matchId: 'match-1', name: 'PREMIUM', displayName: 'Premium' }) }))
    expect(prismaMock.auditEvent.create).toHaveBeenCalled()
  })

  it('requires category management permission', async () => {
    getSessionMock.mockResolvedValue({ ...matchAdmin, permissions: ['requests:read'] })
    expect((await addCategory(request({ name: 'Premium', displayName: 'Premium' }), context('match-1'))).status).toBe(403)
  })

  it('validates the category name', async () => {
    expect((await addCategory(request({ name: 'x', displayName: 'X' }), context('match-1'))).status).toBe(400)
  })
})

describe('quota pool editing', () => {
  it('updates the display name and active flag with an audit event', async () => {
    const response = await patchQuota(request({ displayName: 'ACA Updated', isActive: false }), context('quota-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.quotaPool.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'quota-1' }, data: expect.objectContaining({ displayName: 'ACA Updated', isActive: false }) }))
    expect(prismaMock.auditEvent.create.mock.calls[0][0].data.action).toBe('UPDATE')
  })

  it('requires quotas:write and a valid match-scoped category when reallocating', async () => {
    getSessionMock.mockResolvedValue({ ...matchAdmin, permissions: ['quotas:read'] })
    expect((await patchQuota(request({ displayName: 'New' }), context('quota-1'))).status).toBe(403)
    getSessionMock.mockResolvedValue(superAdmin)
    prismaMock.ticketCategory.findMany = jest.fn().mockResolvedValue([])
    expect((await patchQuota(request({ allocations: [{ ticketCategoryId: 'cat-1', allocatedQuantity: 10 }] }), context('quota-1'))).status).toBe(500)
  })
})
