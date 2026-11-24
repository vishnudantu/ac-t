import { NextRequest } from 'next/server'
import type { SessionPayload } from '@/lib/auth'

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
const hasPermissionMock = jest.fn((permissions: string[], permission: string) => permissions.includes(permission))
const prismaMock = {
  $transaction: jest.fn(),
}

jest.mock('@/lib/auth', () => ({
  getSession: getSessionMock,
  hasPermission: hasPermissionMock,
}))
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { POST } from './route'

const session: SessionPayload = {
  userId: 'officer-1',
  email: 'officer@example.test',
  fullName: 'Allocation Officer',
  roles: ['ALLOCATION_OFFICER'],
  permissions: ['allocations:confirm'],
}

function makeTransaction(allocation: object | null) {
  return {
    allocation: {
      findUnique: jest.fn().mockResolvedValue(allocation),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    allocationItem: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  }
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(session)
})

describe('allocation confirmation', () => {
  it('requires authentication and the allocation confirmation permission', async () => {
    const request = new NextRequest('http://localhost/api/allocations/allocation-1/confirm', { method: 'POST' })
    getSessionMock.mockResolvedValueOnce(null)
    expect((await POST(request, { params: Promise.resolve({ id: 'allocation-1' }) })).status).toBe(401)
    getSessionMock.mockResolvedValueOnce({ ...session, permissions: [] })
    expect((await POST(request, { params: Promise.resolve({ id: 'allocation-1' }) })).status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('atomically confirms a draft allocation and every reserved item with an audit event', async () => {
    const allocation = {
      id: 'allocation-1', matchId: 'match-1', allocationNumber: 'AL-1', status: 'DRAFT',
      items: [{ id: 'item-1', status: 'RESERVED' }, { id: 'item-2', status: 'RESERVED' }],
    }
    const tx = makeTransaction(allocation)
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))

    const response = await POST(
      new NextRequest('http://localhost/api/allocations/allocation-1/confirm', { method: 'POST' }),
      { params: Promise.resolve({ id: 'allocation-1' }) },
    )

    expect(response.status).toBe(200)
    expect(tx.allocation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'allocation-1', status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedBy: 'officer-1' },
    })
    expect(tx.allocationItem.updateMany).toHaveBeenCalledWith({
      where: { allocationId: 'allocation-1', status: 'RESERVED' },
      data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
    })
    expect(tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({
      userId: 'officer-1', matchId: 'match-1', entityType: 'ALLOCATION', entityId: 'allocation-1', action: 'CONFIRM',
    })
  })

  it('rejects missing, non-draft, incomplete and concurrently changed allocations', async () => {
    const request = new NextRequest('http://localhost/api/allocations/allocation-1/confirm', { method: 'POST' })
    const context = { params: Promise.resolve({ id: 'allocation-1' }) }

    const missingTx = makeTransaction(null)
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(missingTx))
    expect((await POST(request, context)).status).toBe(404)

    const confirmedTx = makeTransaction({ id: 'allocation-1', status: 'CONFIRMED', items: [] })
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(confirmedTx))
    expect((await POST(request, context)).status).toBe(409)
    expect(confirmedTx.allocation.updateMany).not.toHaveBeenCalled()

    const incompleteTx = makeTransaction({ id: 'allocation-1', status: 'DRAFT', items: [{ id: 'item-1', status: 'RELEASED' }] })
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(incompleteTx))
    expect((await POST(request, context)).status).toBe(409)
    expect(incompleteTx.allocation.updateMany).not.toHaveBeenCalled()

    const concurrentTx = makeTransaction({ id: 'allocation-1', matchId: 'match-1', status: 'DRAFT', items: [{ id: 'item-1', status: 'RESERVED' }] })
    concurrentTx.allocation.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(concurrentTx))
    expect((await POST(request, context)).status).toBe(409)
    expect(concurrentTx.allocationItem.updateMany).not.toHaveBeenCalled()
  })

  it('fails when items change between the guard and item confirmation', async () => {
    const tx = makeTransaction({ id: 'allocation-1', matchId: 'match-1', status: 'DRAFT', items: [{ id: 'item-1', status: 'RESERVED' }, { id: 'item-2', status: 'RESERVED' }] })
    tx.allocationItem.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx))
    const response = await POST(
      new NextRequest('http://localhost/api/allocations/allocation-1/confirm', { method: 'POST' }),
      { params: Promise.resolve({ id: 'allocation-1' }) },
    )
    expect(response.status).toBe(409)
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
  })
})
