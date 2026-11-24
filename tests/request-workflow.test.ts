import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  match: { findUnique: jest.fn() },
  requester: { findUnique: jest.fn() },
  request: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), create: jest.fn() },
  requestItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  allocation: { count: jest.fn() },
  ticketCategory: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
  auditEvent: { create: jest.fn(), deleteMany: jest.fn() },
  approvalWorkflow: { findFirst: jest.fn(), create: jest.fn() },
  approvalStep: { createMany: jest.fn() },
  role: { findFirst: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { POST as createRequest } from '../src/app/api/requests/route'
import { PATCH as patchRequest, DELETE as deleteRequest } from '../src/app/api/requests/[id]/route'
import { ensureApprovalWorkflow } from '../src/lib/approval-workflow'

const officer: SessionPayload = {
  userId: 'user-1', email: 'desk@example.test', fullName: 'Desk Officer',
  roles: ['REQUEST_DESK_OPERATOR'], permissions: ['requests:write', 'requests:read'],
}
const superAdmin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Super Admin',
  roles: ['SUPER_ADMIN'], permissions: ['requests:write'],
}

function request(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

const validBody = {
  matchId: 'match-1', requesterId: 'requester-1', source: 'IN_PERSON',
  items: [{ ticketCategoryId: 'cat-1', requestedQuantity: 2 }],
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(officer)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', status: 'UPCOMING' })
  prismaMock.requester.findUnique.mockResolvedValue({ id: 'requester-1', isActive: true })
  prismaMock.ticketCategory.findMany.mockResolvedValue([{ id: 'cat-1', matchId: 'match-1', isActive: true }])
  prismaMock.request.create.mockResolvedValue({ id: 'request-1', requestNumber: 'REQ-2026-0099', totalRequested: 2 })
  prismaMock.approvalStep.createMany.mockResolvedValue({ count: 1 })
  prismaMock.approvalWorkflow.findFirst.mockResolvedValue(null)
  prismaMock.approvalWorkflow.create.mockResolvedValue({
    id: 'workflow-1',
    steps: [{ id: 'step-def-1', stepOrder: 1, name: 'Approval review', approverRoleId: 'role-1', approverUserId: null, timeoutHours: 48 }],
  })
  prismaMock.role.findFirst.mockResolvedValue({ id: 'role-1' })
})

describe('automatic approval workflow provisioning', () => {
  it('creates a default workflow when the match has none and submits the request', async () => {
    const response = await createRequest(request('/api/requests', { ...validBody, status: 'SUBMITTED' }))
    expect(response.status).toBe(201)
    expect(prismaMock.approvalWorkflow.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matchId: 'match-1', isDefault: true, isActive: true }) }))
    expect(prismaMock.approvalStep.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ requestId: 'request-1', status: 'IN_PROGRESS' })]) }))
  })

  it('reuses the existing active workflow with steps', async () => {
    prismaMock.approvalWorkflow.findFirst.mockResolvedValue({
      id: 'workflow-existing',
      steps: [{ id: 'step-def-1', stepOrder: 1, name: 'Desk', approverRoleId: 'role-1', approverUserId: null, timeoutHours: 24 }],
    })
    const workflow = await ensureApprovalWorkflow(prismaMock as unknown as Parameters<typeof ensureApprovalWorkflow>[0], 'match-1')
    expect(workflow?.id).toBe('workflow-existing')
    expect(prismaMock.approvalWorkflow.create).not.toHaveBeenCalled()
  })

  it('returns null when no role can decide, instead of dead-ending silently', async () => {
    prismaMock.role.findFirst.mockResolvedValue(null)
    expect(await ensureApprovalWorkflow(prismaMock as unknown as Parameters<typeof ensureApprovalWorkflow>[0], 'match-1')).toBeNull()
  })
})

describe('request editing and deletion', () => {
  it('edits items and totals of a submitted request with an audit event', async () => {
    prismaMock.request.findUnique
      .mockResolvedValueOnce({ id: 'request-1', matchId: 'match-1', status: 'UNDER_REVIEW', assignedToId: null, version: 3 })
      .mockResolvedValueOnce({ requesterId: 'requester-1' })
    prismaMock.request.update.mockResolvedValue({ id: 'request-1', status: 'UNDER_REVIEW', totalRequested: 5 })
    const response = await patchRequest(request('/api/requests/request-1', { items: [{ ticketCategoryId: 'cat-1', requestedQuantity: 5 }] }), context('request-1'))
    expect(response.status).toBe(200)
    expect(prismaMock.requestItem.deleteMany).toHaveBeenCalledWith({ where: { requestId: 'request-1' } })
    expect(prismaMock.requestItem.createMany).toHaveBeenCalled()
    expect(prismaMock.request.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalRequested: 5 }) }))
  })

  it('blocks editing approved or closed requests', async () => {
    prismaMock.request.findUnique.mockResolvedValue({ id: 'request-1', matchId: 'match-1', status: 'APPROVED', assignedToId: null, version: 1 })
    expect((await patchRequest(request('/api/requests/request-1', { priority: 'HIGH' }), context('request-1'))).status).toBe(409)
  })

  it('restricts deletion to super administrators and refuses requests in allocation', async () => {
    expect((await deleteRequest(request('/api/requests/request-1'), context('request-1'))).status).toBe(403)
    getSessionMock.mockResolvedValue(superAdmin)
    prismaMock.request.findUnique.mockResolvedValue({ id: 'request-1', matchId: 'match-1', requestNumber: 'REQ-2026-0099' })
    prismaMock.allocation.count.mockResolvedValue(1)
    expect((await deleteRequest(request('/api/requests/request-1'), context('request-1'))).status).toBe(409)
    prismaMock.allocation.count.mockResolvedValue(0)
    expect((await deleteRequest(request('/api/requests/request-1'), context('request-1'))).status).toBe(200)
    expect(prismaMock.request.delete).toHaveBeenCalledWith({ where: { id: 'request-1' } })
  })
})

describe('request detail route', () => {
  it('returns the full request for an authorised user', async () => {
    const { GET } = await import('../src/app/api/requests/[id]/route')
    prismaMock.request.findUnique.mockResolvedValue({ id: 'request-1', requestNumber: 'REQ-2026-0001' })
    const response = await GET(new NextRequest('http://localhost/api/requests/request-1'), context('request-1'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.request.id).toBe('request-1')
  })

  it('returns 404 and a JSON body when the request does not exist', async () => {
    const { GET } = await import('../src/app/api/requests/[id]/route')
    prismaMock.request.findUnique.mockResolvedValue(null)
    const response = await GET(new NextRequest('http://localhost/api/requests/missing'), context('missing'))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toHaveProperty('error')
  })
})
