import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth'

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
const prismaMock = {
  roleAssignment: { findMany: jest.fn() },
  approvalStep: { findMany: jest.fn(), count: jest.fn() },
  approvalWorkflow: { findFirst: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/auth', () => ({
  getSession: getSessionMock,
  hasPermission: (permissions: string[], required: string | string[]) =>
    (Array.isArray(required) ? required : [required]).every((permission) => permissions.includes(permission)),
  hasRole: (roles: string[], required: string | string[]) =>
    (Array.isArray(required) ? required : [required]).some((role) => roles.includes(role)),
}))
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

import { GET as approvalsGet, POST as approvalsPost } from '../src/app/api/approvals/route'
import { POST as distributionPost } from '../src/app/api/distribution/route'
import { POST as requestsPost } from '../src/app/api/requests/route'

const session: SessionPayload = {
  userId: 'user-1', email: 'operator@example.test', fullName: 'Operator',
  roles: ['APPROVER'], permissions: ['approvals:read', 'approvals:decide', 'distribution:write', 'distribution:issue', 'requests:write'],
}

function request(body: object): NextRequest {
  return new NextRequest('http://localhost/api/distribution', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(session)
  prismaMock.roleAssignment.findMany.mockResolvedValue([{ roleId: 'role-1' }])
  prismaMock.approvalStep.findMany.mockResolvedValue([])
  prismaMock.approvalStep.count.mockResolvedValue(0)
  prismaMock.approvalWorkflow.findFirst.mockResolvedValue({ id: 'workflow-1', steps: [
    { id: 'definition-1', stepOrder: 1, name: 'First', approverUserId: 'approver-1', approverRoleId: null, timeoutHours: 24 },
    { id: 'definition-2', stepOrder: 2, name: 'Second', approverUserId: null, approverRoleId: 'role-1', timeoutHours: null },
  ] })
  prismaMock.$transaction.mockImplementation(async (operations) => Promise.all(operations))
})

describe('approval queue route', () => {
  it('lists only steps assigned directly or through a current active GLOBAL role', async () => {
    const response = await approvalsGet(new NextRequest('http://localhost/api/approvals'))
    expect(response.status).toBe(200)
    expect(prismaMock.approvalStep.findMany.mock.calls[0][0].where).toEqual({
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      OR: [{ assignedToId: 'user-1' }, { assignedRoleId: { in: ['role-1'] }, assignedRole: { isActive: true } }],
    })
    expect(prismaMock.roleAssignment.findMany.mock.calls[0][0].where).toMatchObject({ scope: 'GLOBAL', matchId: null, isActive: true })
  })

  it('lets a super administrator oversee every pending step regardless of role assignment', async () => {
    getSessionMock.mockResolvedValueOnce({
      userId: 'admin-1', email: 'admin@example.test', fullName: 'Super Admin',
      roles: ['SUPER_ADMIN'], permissions: ['approvals:read', 'approvals:decide', 'approvals:escalate'],
    })
    const response = await approvalsGet(new NextRequest('http://localhost/api/approvals'))
    expect(response.status).toBe(200)
    expect(prismaMock.approvalStep.findMany.mock.calls[0][0].where).toEqual({ status: { in: ['PENDING', 'IN_PROGRESS'] } })
  })

  it('requires authentication and the approval read permission', async () => {
    getSessionMock.mockResolvedValue(null)
    expect((await approvalsGet(new NextRequest('http://localhost/api/approvals'))).status).toBe(401)
    getSessionMock.mockResolvedValue({ ...session, permissions: [] })
    expect((await approvalsGet(new NextRequest('http://localhost/api/approvals'))).status).toBe(403)
    expect(prismaMock.approvalStep.findMany).not.toHaveBeenCalled()
  })
})

describe('approval decision route', () => {
  it('audits a quantity and ticket-type revision and restarts the chain without allocating stock', async () => {
    const step = {
      id: 'step-2', requestId: 'request-1', status: 'IN_PROGRESS', stepOrder: 2,
      assignedToId: 'user-1', assignedRoleId: null, assignedRole: null,
      stepDefinition: { isActive: true }, workflow: { isActive: true },
      request: {
        id: 'request-1', matchId: 'match-1', version: 3, totalRequested: 2, totalApproved: 2,
        preferredType: 'COMPLIMENTARY', status: 'UNDER_REVIEW',
        items: [{ id: 'item-1', requestedQuantity: 2, approvedQuantity: 2 }],
        approvalSteps: [{ id: 'step-1', stepOrder: 1, status: 'APPROVED' }, { id: 'step-2', stepOrder: 2, status: 'IN_PROGRESS' }],
      },
    }
    const tx = {
      roleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStep: { findFirst: jest.fn().mockResolvedValue(step), updateMany: jest.fn(), update: jest.fn() },
      request: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestItem: { update: jest.fn() },
      allocation: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      auditEvent: { create: jest.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const revision = {
      stepId: 'step-2', action: 'REVISE', requestVersion: 3, reason: 'Purchase stock agreed', ticketType: 'PURCHASE',
      items: [{ requestItemId: 'item-1', requestedQuantity: 25 }],
    }
    const post = (body: object) => approvalsPost(new NextRequest('http://localhost/api/approvals', {
      method: 'POST', body: JSON.stringify(body),
    }))
    expect((await post({ ...revision, reason: ' ' })).status).toBe(400)
    expect((await post({ ...revision, requestVersion: 2 })).status).toBe(409)
    expect(tx.request.updateMany).not.toHaveBeenCalled()
    expect((await post(revision)).status).toBe(200)
    expect(tx.requestItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' }, data: { requestedQuantity: 25, approvedQuantity: 0 },
    })
    expect(tx.request.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ preferredType: 'PURCHASE', totalRequested: 25, totalApproved: 0 }),
    }))
    expect(tx.approvalStep.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'step-1' }, data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }))
    expect(tx.allocation.create).not.toHaveBeenCalled()
    const audit = tx.auditEvent.create.mock.calls[0][0].data
    expect(audit).toMatchObject({ action: 'REVISE_REQUEST', entityId: 'request-1', userId: 'user-1', reason: revision.reason })
    expect(JSON.parse(audit.oldValues)).toMatchObject({ totalRequested: 2, ticketType: 'COMPLIMENTARY' })
    expect(JSON.parse(audit.newValues)).toMatchObject({ totalRequested: 25, ticketType: 'PURCHASE' })
  })

  it('claims the step and request version before advancing and auditing a partial approval', async () => {
    const step = {
      id: 'step-1', requestId: 'request-1', status: 'IN_PROGRESS', stepOrder: 1, updatedAt: new Date('2026-11-24T10:00:00.000Z'), startedAt: null,
      assignedToId: 'user-1', assignedRoleId: null, assignedRole: null,
      stepDefinition: { isActive: true, allowPartialApproval: true, allowReturnForClarification: true }, workflow: { isActive: true },
      request: {
        id: 'request-1', matchId: 'match-1', version: 3, totalRequested: 10, totalApproved: 0, status: 'UNDER_REVIEW', fulfilmentStatus: 'PENDING', approvedAt: null,
        items: [{ id: 'item-1', requestedQuantity: 10, approvedQuantity: 0 }],
        approvalSteps: [{ id: 'step-1', stepOrder: 1, status: 'IN_PROGRESS' }, { id: 'step-2', stepOrder: 2, status: 'PENDING' }],
      },
    }
    const tx = {
      roleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStep: {
        findFirst: jest.fn().mockResolvedValue(step),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'step-1', status: 'PARTIAL' }),
      },
      request: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({}) },
      requestItem: { update: jest.fn().mockResolvedValue({}) },
      allocation: { count: jest.fn().mockResolvedValue(0) },
      approvalDecision: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await approvalsPost(new NextRequest('http://localhost/api/approvals', {
      method: 'POST', body: JSON.stringify({ stepId: 'step-1', action: 'PARTIAL', remarks: 'Five approved pending confirmation', items: [{ requestItemId: 'item-1', approvedQuantity: 5 }] }),
    }))
    expect(response.status).toBe(200)
    expect(tx.approvalStep.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'step-1', status: 'IN_PROGRESS', updatedAt: step.updatedAt },
      data: expect.objectContaining({ status: 'PARTIAL' }),
    }))
    expect(tx.request.updateMany).toHaveBeenCalledWith({ where: { id: 'request-1', status: 'UNDER_REVIEW', version: 3, totalApproved: 0 }, data: { version: { increment: 1 } } })
    expect(tx.requestItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { approvedQuantity: 5 } })
    expect(tx.request.update.mock.calls[0][0].data).toMatchObject({ status: 'UNDER_REVIEW', totalApproved: 5 })
    expect(tx.approvalStep.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: 'step-2', status: 'PENDING' }, data: expect.objectContaining({ status: 'IN_PROGRESS' }) }))
    expect(tx.approvalDecision.createMany.mock.calls[0][0].data[0]).toMatchObject({ decidedById: 'user-1', action: 'PARTIAL', approvedQty: 5 })
    expect(tx.auditEvent.create).toHaveBeenCalled()
  })

  it('rejects an out-of-order decision before claiming any state', async () => {
    const step = {
      id: 'step-2', requestId: 'request-1', status: 'PENDING', stepOrder: 2, updatedAt: new Date('2026-11-24T10:00:00.000Z'), startedAt: null,
      assignedToId: 'user-1', assignedRoleId: null, assignedRole: null,
      stepDefinition: { isActive: true, allowPartialApproval: true, allowReturnForClarification: true }, workflow: { isActive: true },
      request: {
        id: 'request-1', matchId: 'match-1', version: 3, totalRequested: 10, totalApproved: 0, status: 'UNDER_REVIEW', fulfilmentStatus: 'PENDING', approvedAt: null,
        items: [{ id: 'item-1', requestedQuantity: 10, approvedQuantity: 0 }],
        approvalSteps: [{ id: 'step-1', stepOrder: 1, status: 'IN_PROGRESS' }, { id: 'step-2', stepOrder: 2, status: 'PENDING' }],
      },
    }
    const tx = {
      roleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStep: { findFirst: jest.fn().mockResolvedValue(step), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      request: { updateMany: jest.fn(), update: jest.fn() },
      requestItem: { update: jest.fn() },
      allocation: { count: jest.fn().mockResolvedValue(0) },
      approvalDecision: { createMany: jest.fn() },
      auditEvent: { create: jest.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await approvalsPost(new NextRequest('http://localhost/api/approvals', {
      method: 'POST', body: JSON.stringify({ stepId: 'step-2', action: 'APPROVE', remarks: 'Skip ahead', items: [{ requestItemId: 'item-1', approvedQuantity: 10 }] }),
    }))
    expect(response.status).toBe(409)
    expect(tx.approvalStep.updateMany).not.toHaveBeenCalled()
    expect(tx.request.updateMany).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
  })

  it('returns a 4xx for business-rule failures instead of a 500', async () => {
    const step = {
      id: 'step-1', requestId: 'request-1', status: 'IN_PROGRESS', stepOrder: 1, updatedAt: new Date('2026-11-24T10:00:00.000Z'), startedAt: null,
      assignedToId: 'user-1', assignedRoleId: null, assignedRole: null,
      stepDefinition: { isActive: true, allowPartialApproval: true, allowReturnForClarification: true }, workflow: { isActive: true },
      request: {
        id: 'request-1', matchId: 'match-1', version: 3, totalRequested: 10, totalApproved: 0, status: 'UNDER_REVIEW', fulfilmentStatus: 'PENDING', approvedAt: null,
        items: [{ id: 'item-1', requestedQuantity: 10, approvedQuantity: 0 }],
        approvalSteps: [{ id: 'step-1', stepOrder: 1, status: 'IN_PROGRESS' }],
      },
    }
    const tx = {
      roleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStep: { findFirst: jest.fn().mockResolvedValue(step), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      request: { updateMany: jest.fn(), update: jest.fn() },
      requestItem: { update: jest.fn() },
      allocation: { count: jest.fn().mockResolvedValue(0) },
      approvalDecision: { createMany: jest.fn() },
      auditEvent: { create: jest.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await approvalsPost(new NextRequest('http://localhost/api/approvals', {
      method: 'POST', body: JSON.stringify({ stepId: 'step-1', action: 'APPROVE', remarks: 'Too many', items: [{ requestItemId: 'item-1', approvedQuantity: 11 }] }),
    }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/requested quantity/i)
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
  })
})

describe('distribution issue route', () => {
  const baseItem = { allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'A Recipient' }
  it('requires ticket-issue permission to issue, while batch creation needs only write permission', async () => {
    getSessionMock.mockResolvedValue({ ...session, permissions: ['distribution:write'] })
    const response = await distributionPost(request({ action: 'ISSUE', items: [{ allocationItemId: 'allocation-item-1', quantity: 1, recipientName: 'Recipient' }] }))
    expect(response.status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('creates a batch owned by the current session with an audit event', async () => {
    const tx = {
      match: { findUnique: jest.fn().mockResolvedValue({ id: 'match-1' }) },
      distributionBatch: { create: jest.fn().mockResolvedValue({ id: 'batch-1', matchId: 'match-1', batchNumber: 'DIST-1', status: 'PREPARING', distributionMethod: 'PHYSICAL' }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    getSessionMock.mockResolvedValue({ ...session, permissions: ['distribution:write'] })
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await distributionPost(request({ action: 'CREATE_BATCH', matchId: 'match-1', distributionMethod: 'PHYSICAL' }))
    expect(response.status).toBe(201)
    expect(tx.distributionBatch.create.mock.calls[0][0].data).toMatchObject({ officerId: 'user-1', matchId: 'match-1', status: 'PREPARING' })
    expect(tx.auditEvent.create).toHaveBeenCalled()
  })

  it('rejects malformed input before opening a transaction', async () => {
    const response = await distributionPost(request({ action: 'ISSUE', items: [{ ...baseItem, quantity: 0 }] }))
    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('atomically records issuance without charging available stock again', async () => {
    const allocation = {
      id: 'allocation-item-1', status: 'CONFIRMED', quantity: 5, requestItemId: 'request-item-1',
      updatedAt: new Date('2026-11-24T10:00:00.000Z'), standName: 'East', blockName: 'A', seatDetails: 'A1-A5',
      allocation: { status: 'CONFIRMED', matchId: 'match-1' },
      requestItem: { id: 'request-item-1', requestId: 'request-1', requestedQuantity: 5, approvedQuantity: 5, issuedQuantity: 1 },
      inventoryPool: { id: 'pool-1', availableQuantity: 10, totalQuantity: 10, reservedQuantity: 0, returnedQuantity: 0, issuedQuantity: 0, voidQuantity: 0 },
      ticketCategory: { displayName: 'East Stand' },
    }
    const tx = {
      allocationItem: { findMany: jest.fn().mockResolvedValue([allocation]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ticketIssuance: {
        groupBy: jest.fn().mockResolvedValue([{ allocationItemId: 'allocation-item-1', _sum: { quantity: 1 } }]),
        create: jest.fn().mockResolvedValue({ id: 'issuance-1', quantity: 2 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 3 } }),
      },
      inventoryPool: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      request: { findUniqueOrThrow: jest.fn().mockResolvedValue({ totalIssued: 1, totalApproved: 5 }), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      distributionBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', matchId: 'match-1', status: 'PREPARING', distributionMethod: 'PHYSICAL', issuedTickets: 1, startedAt: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketSerial: { updateMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await distributionPost(request({ action: 'ISSUE', batchId: 'batch-1', items: [baseItem] }))
    expect(response.status).toBe(201)
    expect(tx.inventoryPool.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "pool-1", issuedQuantity: { lte: 8 } }),
      data: { issuedQuantity: { increment: 2 } },
    }))
    expect(tx.requestItem.updateMany.mock.calls[0][0].where.approvedQuantity).toEqual({ gte: 3 })
    expect(tx.allocationItem.updateMany.mock.calls[0][0].data.status).toBe('CONFIRMED')
    expect(tx.ticketIssuance.create.mock.calls[0][0].data).toMatchObject({ batchId: 'batch-1', quantity: 2, recipientName: 'A Recipient', distributedById: 'user-1' })
    expect(tx.request.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalIssued: 3, fulfilmentStatus: 'PARTIALLY_ISSUED' }),
    }))
    expect(tx.auditEvent.create).toHaveBeenCalled()
  })

  it('rolls back when the allocation item was concurrently changed', async () => {
    const allocation = {
      id: 'allocation-item-1', status: 'CONFIRMED', quantity: 5, requestItemId: 'request-item-1', updatedAt: new Date(), standName: 'East',
      allocation: { status: 'CONFIRMED', matchId: 'match-1' },
      requestItem: { id: 'request-item-1', requestId: 'request-1', requestedQuantity: 5, approvedQuantity: 5, issuedQuantity: 0 },
      inventoryPool: { id: 'pool-1', availableQuantity: 10, totalQuantity: 10, reservedQuantity: 0, returnedQuantity: 0, issuedQuantity: 0, voidQuantity: 0 },
      ticketCategory: { displayName: 'East Stand' },
    }
    const tx = {
      allocationItem: { findMany: jest.fn().mockResolvedValue([allocation]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ticketIssuance: { groupBy: jest.fn().mockResolvedValue([]), create: jest.fn(), aggregate: jest.fn() },
      inventoryPool: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      request: { findUniqueOrThrow: jest.fn().mockResolvedValue({ totalIssued: 0, totalApproved: 5 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      distributionBatch: { findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', matchId: 'match-1', status: 'PREPARING', distributionMethod: 'PHYSICAL' }), update: jest.fn() },
      ticketSerial: { updateMany: jest.fn() },
      auditEvent: { create: jest.fn() },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await distributionPost(request({ action: 'ISSUE', batchId: 'batch-1', items: [baseItem] }))
    expect(response.status).toBe(409)
    expect(tx.ticketIssuance.create).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
  })

  it('issues the same allocation item to multiple recipients and marks it fully issued', async () => {
    const allocation = {
      id: 'allocation-item-1', status: 'CONFIRMED', quantity: 5, requestItemId: 'request-item-1',
      updatedAt: new Date('2026-11-24T10:00:00.000Z'), standName: 'East', blockName: 'A', seatDetails: 'A1-A5',
      allocation: { status: 'CONFIRMED', matchId: 'match-1' },
      requestItem: { id: 'request-item-1', requestId: 'request-1', requestedQuantity: 5, approvedQuantity: 5, issuedQuantity: 1 },
      inventoryPool: { id: 'pool-1', availableQuantity: 10, totalQuantity: 10, reservedQuantity: 0, returnedQuantity: 0, issuedQuantity: 0, voidQuantity: 0 },
      ticketCategory: { displayName: 'East Stand' },
    }
    const tx = {
      allocationItem: { findMany: jest.fn().mockResolvedValue([allocation]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ticketIssuance: {
        groupBy: jest.fn().mockResolvedValue([{ allocationItemId: 'allocation-item-1', _sum: { quantity: 1 } }]),
        create: jest.fn().mockResolvedValue({ id: 'issuance-1' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 5 } }),
      },
      inventoryPool: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      request: { findUniqueOrThrow: jest.fn().mockResolvedValue({ totalIssued: 1, totalApproved: 5 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      distributionBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', matchId: 'match-1', status: 'PREPARING', distributionMethod: 'PHYSICAL', issuedTickets: 1, startedAt: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketSerial: { updateMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await distributionPost(request({ action: 'ISSUE', batchId: 'batch-1', items: [
      { allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'First Recipient' },
      { allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'Second Recipient' },
    ] }))
    expect(response.status).toBe(201)
    expect(tx.ticketIssuance.create).toHaveBeenCalledTimes(2)
    expect(tx.requestItem.updateMany.mock.calls[0][0].where.approvedQuantity).toEqual({ gte: 3 })
    expect(tx.requestItem.updateMany.mock.calls[1][0].where.approvedQuantity).toEqual({ gte: 5 })
    expect(tx.allocationItem.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.allocationItem.updateMany.mock.calls[0][0].data.status).toBe('ISSUED')
    expect(tx.request.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalIssued: 5, fulfilmentStatus: 'ISSUED' }),
    }))
    expect(tx.auditEvent.create).toHaveBeenCalled()
  })

  it('updates request fulfilment from cumulative issuance after a repeat partial issuance', async () => {
    const allocation = {
      id: 'allocation-item-1', status: 'CONFIRMED', quantity: 10, requestItemId: 'request-item-1',
      updatedAt: new Date('2026-11-24T10:00:00.000Z'), standName: 'East', blockName: 'A', seatDetails: 'A1-A10',
      allocation: { status: 'CONFIRMED', matchId: 'match-1' },
      requestItem: { id: 'request-item-1', requestId: 'request-1', requestedQuantity: 10, approvedQuantity: 10, issuedQuantity: 4 },
      inventoryPool: { id: 'pool-1', availableQuantity: 10, totalQuantity: 10, reservedQuantity: 0, returnedQuantity: 0, issuedQuantity: 4, voidQuantity: 0 },
      ticketCategory: { displayName: 'East Stand' },
    }
    const tx = {
      allocationItem: { findMany: jest.fn().mockResolvedValue([allocation]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ticketIssuance: {
        groupBy: jest.fn().mockResolvedValue([{ allocationItemId: 'allocation-item-1', _sum: { quantity: 4 } }]),
        create: jest.fn().mockResolvedValue({ id: 'issuance-1' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 6 } }),
      },
      inventoryPool: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requestItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      request: { findUniqueOrThrow: jest.fn().mockResolvedValue({ totalIssued: 4, totalApproved: 10 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      distributionBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', matchId: 'match-1', status: 'PREPARING', distributionMethod: 'PHYSICAL', issuedTickets: 4, startedAt: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketSerial: { updateMany: jest.fn() },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await distributionPost(request({ action: 'ISSUE', batchId: 'batch-1', items: [
      { allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'First Recipient' },
      { allocationItemId: 'allocation-item-1', quantity: 2, recipientName: 'Second Recipient' },
    ] }))
    expect(response.status).toBe(201)
    expect(tx.request.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'request-1', totalIssued: 4 },
      data: expect.objectContaining({ totalIssued: 8, fulfilmentStatus: 'PARTIALLY_ISSUED' }),
    }))
  })
})

describe('request creation route', () => {
  const baseRequest = {
    matchId: 'match-1', requesterId: 'requester-1', source: 'EMAIL',
    items: [{ ticketCategoryId: 'category-1', requestedQuantity: 2 }],
  }

  function requestTx() {
    return {
      match: { findUnique: jest.fn().mockResolvedValue({ id: 'match-1', status: 'UPCOMING' }) },
      requester: { findUnique: jest.fn().mockResolvedValue({ id: 'requester-1', isActive: true }) },
      ticketCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'category-1', matchId: 'match-1', isActive: true }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-approver' }) },
      approvalWorkflow: { findFirst: jest.fn().mockResolvedValue({ id: 'workflow-1', steps: [
        { id: 'definition-1', stepOrder: 1, name: 'First', approverUserId: 'approver-1', approverRoleId: null, timeoutHours: 24 },
        { id: 'definition-2', stepOrder: 2, name: 'Second', approverUserId: null, approverRoleId: 'role-1', timeoutHours: null },
      ] }), create: jest.fn().mockResolvedValue({ id: 'workflow-new', steps: [
        { id: 'definition-new', stepOrder: 1, name: 'Approval review', approverUserId: null, approverRoleId: 'role-approver', timeoutHours: 48 },
      ] }) },
      request: { create: jest.fn().mockResolvedValue({ id: 'request-1', requestNumber: 'REQ-1', totalRequested: 2, items: [] }), findMany: jest.fn().mockResolvedValue([]) },
      approvalStep: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    }
  }

  it('creates a submitted request with its first approval step in progress and the rest pending', async () => {
    const tx = requestTx()
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await requestsPost(request({ ...baseRequest, status: 'SUBMITTED' }))
    expect(response.status).toBe(201)
    expect(tx.request.create.mock.calls[0][0].data).toMatchObject({ status: 'UNDER_REVIEW', fulfilmentStatus: 'PENDING', totalRequested: 2 })
    const steps = tx.approvalStep.createMany.mock.calls[0][0].data
    expect(steps[0]).toMatchObject({ stepOrder: 1, status: 'IN_PROGRESS' })
    expect(steps[1]).toMatchObject({ stepOrder: 2, status: 'PENDING' })
    expect(tx.auditEvent.create).toHaveBeenCalled()
  })

  it('rejects duplicate categories and more than 100 request lines before opening a transaction', async () => {
    const duplicate = await requestsPost(request({ ...baseRequest, items: [
      { ticketCategoryId: 'category-1', requestedQuantity: 1 },
      { ticketCategoryId: 'category-1', requestedQuantity: 1 },
    ] }))
    expect(duplicate.status).toBe(400)
    const tooMany = await requestsPost(request({ ...baseRequest, items: Array.from({ length: 101 }, () => ({
      ticketCategoryId: 'category-1', requestedQuantity: 1,
    })) }))
    expect(tooMany.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('does not allow a client to set server-owned lifecycle status', async () => {
    const response = await requestsPost(request({ ...baseRequest, status: 'APPROVED' }))
    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('auto-provisions a workflow when submitting and skips steps for a draft', async () => {
    const tx = requestTx()
    tx.approvalWorkflow.findFirst.mockResolvedValue(null)
    tx.role.findFirst.mockResolvedValue({ id: 'role-approver' })
    tx.approvalWorkflow.create.mockResolvedValue({
      id: 'workflow-1',
      steps: [{ id: 'step-def-1', stepOrder: 1, name: 'Approval review', approverRoleId: 'role-approver', approverUserId: null, timeoutHours: 48 }],
    })
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const submitted = await requestsPost(request({ ...baseRequest, status: 'SUBMITTED' }))
    expect(submitted.status).toBe(201)
    expect(tx.approvalWorkflow.create).toHaveBeenCalled()
    expect(tx.approvalStep.createMany).toHaveBeenCalled()

    const draftTx = requestTx()
    prismaMock.$transaction.mockImplementation(async (callback) => callback(draftTx))
    const draft = await requestsPost(request({ ...baseRequest, status: 'DRAFT' }))
    expect(draft.status).toBe(201)
    expect(draftTx.approvalStep.createMany).not.toHaveBeenCalled()
  })

  it('still refuses submission when no role can decide approvals', async () => {
    const tx = requestTx()
    tx.approvalWorkflow.findFirst.mockResolvedValue(null)
    tx.role.findFirst.mockResolvedValue(null)
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx))
    const response = await requestsPost(request({ ...baseRequest, status: 'SUBMITTED' }))
    expect(response.status).toBe(422)
    expect(tx.request.create).not.toHaveBeenCalled()
  })
})
