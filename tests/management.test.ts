import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  venue: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(), create: jest.fn() },
  requester: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  request: { count: jest.fn() },
  inventoryPool: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  match: { update: jest.fn() },
  allocationItem: { count: jest.fn() },
  ticketSerial: { count: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  approvalDecision: { count: jest.fn() },
  allocation: { count: jest.fn() },
  ticketIssuance: { count: jest.fn() },
  roleAssignment: { updateMany: jest.fn(), create: jest.fn() },
  role: { findUnique: jest.fn() },
  systemSetting: { deleteMany: jest.fn() },
  sessionToken: { deleteMany: jest.fn() },
  auditEvent: { create: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { DELETE as deleteVenue, PATCH as patchVenue } from '../src/app/api/venues/[id]/route'
import { DELETE as deleteRequester, PATCH as patchRequester } from '../src/app/api/requesters/[id]/route'
import { DELETE as deleteInventory } from '../src/app/api/inventory/[id]/route'
import { PATCH as patchUser, DELETE as deleteUser } from '../src/app/api/admin/users/[id]/route'

const admin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Admin',
  roles: ['SUPER_ADMIN'],
  permissions: ['matches:write', 'matches:delete', 'requests:write', 'requests:delete', 'inventory:write', 'inventory:adjust', 'users:write'],
}
const operator: SessionPayload = {
  userId: 'user-1', email: 'op@example.test', fullName: 'Operator',
  roles: ['OPERATOR'], permissions: ['requests:read'],
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
  getSessionMock.mockResolvedValue(admin)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue-1', name: 'Old Ground', capacity: 100 })
  prismaMock.venue.update.mockResolvedValue({ id: 'venue-1', name: 'New Ground', capacity: 100 })
  prismaMock.venue.delete.mockResolvedValue({ id: 'venue-1' })
  prismaMock.requester.findUnique.mockResolvedValue({ id: 'req-1', fullName: 'Old Name', isActive: true })
  prismaMock.requester.update.mockResolvedValue({ id: 'req-1', fullName: 'New Name', isActive: false })
  prismaMock.requester.delete.mockResolvedValue({ id: 'req-1' })
  prismaMock.inventoryPool.findUnique.mockResolvedValue({ id: 'inv-1', matchId: 'match-1', totalQuantity: 100, _count: { allocations: 0, ticketSerials: 0 } })
  prismaMock.inventoryPool.delete.mockResolvedValue({ id: 'inv-1' })
  prismaMock.match.update.mockResolvedValue({})
  prismaMock.request.count.mockResolvedValue(0)
  prismaMock.allocationItem.count.mockResolvedValue(0)
  prismaMock.ticketSerial.count.mockResolvedValue(0)
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-2', fullName: 'Target User', isActive: true, roleAssignments: [] })
  prismaMock.user.update.mockResolvedValue({ id: 'user-2', fullName: 'Target User', isActive: false })
  prismaMock.approvalDecision.count.mockResolvedValue(0)
  prismaMock.allocation.count.mockResolvedValue(0)
  prismaMock.ticketIssuance.count.mockResolvedValue(0)
  prismaMock.auditEvent.count.mockResolvedValue(0)
})

describe('venue management', () => {
  it('requires matches:write and edits the venue name', async () => {
    getSessionMock.mockResolvedValueOnce(operator)
    expect((await patchVenue(request({ name: 'New Ground' }), context('venue-1'))).status).toBe(403)
    const response = await patchVenue(request({ name: 'New Ground' }), context('venue-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.venue.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'venue-1' }, data: { name: 'New Ground' } }))
  })

  it('refuses to delete a venue that is still referenced by a match', async () => {
    prismaMock.venue.count.mockResolvedValue(1)
    const response = await deleteVenue(request(), context('venue-1'))
    expect(response.status).toBe(409)
    expect(prismaMock.venue.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused venue and records an audit event', async () => {
    prismaMock.venue.count.mockResolvedValue(0)
    const response = await deleteVenue(request(), context('venue-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.venue.delete).toHaveBeenCalledWith({ where: { id: 'venue-1' } })
    expect(prismaMock.auditEvent.create.mock.calls[0][0].data.action).toBe('DELETE')
  })
})

describe('requester management', () => {
  it('edits requester details and requires requests:write', async () => {
    getSessionMock.mockResolvedValueOnce(operator)
    expect((await patchRequester(request({ fullName: 'New Name' }), context('req-1'))).status).toBe(403)
    const response = await patchRequester(request({ fullName: 'New Name', isActive: false }), context('req-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.requester.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'req-1' } }))
  })

  it('blocks deleting a requester that has request history', async () => {
    prismaMock.request.count.mockResolvedValue(2)
    const response = await deleteRequester(request(), context('req-1'))
    expect(response.status).toBe(409)
    expect(prismaMock.requester.delete).not.toHaveBeenCalled()
  })

  it('deletes a requester without history', async () => {
    const response = await deleteRequester(request(), context('req-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.requester.delete).toHaveBeenCalledWith({ where: { id: 'req-1' } })
  })
})

describe('inventory pool management', () => {
  it('blocks deleting a pool with allocation or serial history', async () => {
    prismaMock.inventoryPool.findUnique
      .mockResolvedValueOnce({ id: 'inv-1', _count: { allocations: 1, ticketSerials: 0 } })
      .mockResolvedValueOnce({ id: 'inv-1', _count: { allocations: 0, ticketSerials: 3 } })
    expect((await deleteInventory(request(), context('inv-1'))).status).toBe(409)
    expect((await deleteInventory(request(), context('inv-1'))).status).toBe(409)
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2)
    expect(prismaMock.inventoryPool.delete).not.toHaveBeenCalled()
  })

  it('preserves a pool with issued stock even if it has no internal allocation records', async () => {
    prismaMock.inventoryPool.findUnique.mockResolvedValueOnce({
      id: 'inv-1', issuedQuantity: 2, _count: { allocations: 0, ticketSerials: 0 },
    })
    expect((await deleteInventory(request(), context('inv-1'))).status).toBe(409)
    expect(prismaMock.inventoryPool.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused pool and decrements the match total', async () => {
    const response = await deleteInventory(request(), context('inv-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.match.update).toHaveBeenCalledWith({ where: { id: 'match-1' }, data: { totalInventory: { decrement: 100 } } })
    expect(prismaMock.inventoryPool.delete).toHaveBeenCalled()
  })
})

describe('user administration', () => {
  it('activates or deactivates a user and revokes sessions when deactivating', async () => {
    const response = await patchUser(request({ isActive: false }), context('user-2'))
    expect(response.status).toBe(200)
    expect(prismaMock.sessionToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-2' } })
  })

  it('prevents an administrator from deactivating or deleting their own account', async () => {
    expect((await patchUser(request({ isActive: false }), context('admin-1'))).status).toBe(400)
    expect((await deleteUser(request(), context('admin-1'))).status).toBe(400)
  })

  it('deletes an unused user and blocks deleting one with history', async () => {
    prismaMock.request.count.mockResolvedValue(1)
    expect((await deleteUser(request(), context('user-2'))).status).toBe(409)
    prismaMock.request.count.mockResolvedValue(0)
    const response = await deleteUser(request(), context('user-2'))
    expect(response.status).toBe(200)
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'user-2' } })
  })
})
