import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  match: { findUnique: jest.fn() },
  role: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  permission: { count: jest.fn(), findMany: jest.fn() },
  rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
  roleAssignment: { count: jest.fn() },
  approvalWorkflow: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { GET as listWorkflows, POST as createWorkflow } from '../src/app/api/approval-workflows/route'
import { DELETE as deleteWorkflow } from '../src/app/api/approval-workflows/[id]/route'
import { PATCH as patchRole, DELETE as deleteRole } from '../src/app/api/admin/roles/[id]/route'

const admin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Admin',
  roles: ['SUPER_ADMIN'], permissions: ['approvals:read', 'approvals:configure', 'roles:read', 'roles:write'],
}
const viewer: SessionPayload = {
  userId: 'user-2', email: 'viewer@example.test', fullName: 'Viewer',
  roles: ['AUDITOR'], permissions: ['approvals:read'],
}

function request(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

const validWorkflow = {
  matchId: 'match-1', name: 'Two-level approval', isDefault: true,
  steps: [
    { stepOrder: 1, name: 'Desk verification', approverRoleId: 'role-1', minQuantity: 0, timeoutHours: 24 },
    { stepOrder: 2, name: 'Secretary approval', approverRoleId: 'role-2', minQuantity: 0, maxQuantity: 100, allowPartialApproval: true, timeoutHours: 48 },
  ],
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(admin)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', title: 'Final ODI' })
  prismaMock.role.findMany.mockResolvedValue([{ id: 'role-1' }, { id: 'role-2' }])
  prismaMock.approvalWorkflow.create.mockResolvedValue({ id: 'wf-1', steps: [] })
})

describe('approval workflow management', () => {
  it('creates a multi-step workflow with validation and audit', async () => {
    const response = await createWorkflow(request('/api/approval-workflows', validWorkflow))
    expect(response.status).toBe(201)
    expect(prismaMock.approvalWorkflow.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matchId: 'match-1', isDefault: true }) }))
    expect(prismaMock.auditEvent.create).toHaveBeenCalled()
  })

  it('requires approvals:configure', async () => {
    getSessionMock.mockResolvedValue(viewer)
    expect((await createWorkflow(request('/api/approval-workflows', validWorkflow))).status).toBe(403)
  })

  it('rejects steps without an approver and duplicate orders', async () => {
    const noApprover = await createWorkflow(request('/api/approval-workflows', { ...validWorkflow, steps: [{ stepOrder: 1, name: 'X', minQuantity: 0 }] }))
    expect(noApprover.status).toBe(400)
    const duplicateOrders = await createWorkflow(request('/api/approval-workflows', {
      ...validWorkflow,
      steps: [
        { stepOrder: 1, name: 'A', approverRoleId: 'role-1', minQuantity: 0 },
        { stepOrder: 1, name: 'B', approverRoleId: 'role-2', minQuantity: 0 },
      ],
    }))
    expect(duplicateOrders.status).toBe(400)
  })

  it('blocks deleting a workflow with in-flight steps for non-super-admins and allows super admins on unused ones', async () => {
    getSessionMock.mockResolvedValue({ ...viewer, permissions: ['approvals:read', 'approvals:configure'] })
    expect((await deleteWorkflow(request('/api/approval-workflows/wf-1'), context('wf-1'))).status).toBe(403)
    getSessionMock.mockResolvedValue(admin)
    prismaMock.approvalWorkflow.findUnique.mockResolvedValue({ id: 'wf-1', matchId: 'match-1', name: 'W', _count: { steps: 1 } })
    expect((await deleteWorkflow(request('/api/approval-workflows/wf-1'), context('wf-1'))).status).toBe(409)
    prismaMock.approvalWorkflow.findUnique.mockResolvedValue({ id: 'wf-1', matchId: 'match-1', name: 'W', _count: { steps: 0 } })
    expect((await deleteWorkflow(request('/api/approval-workflows/wf-1'), context('wf-1'))).status).toBe(200)
  })

  it('lists workflows for a match', async () => {
    const listRequest = new NextRequest('http://localhost/api/approval-workflows?matchId=match-1')
    prismaMock.approvalWorkflow.findMany.mockResolvedValue([])
    expect((await listWorkflows(listRequest, admin as never)).status).toBe(200)
  })
})

describe('role privilege management', () => {
  it('replaces the permission set of a role with an audit event', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-9', name: 'EVENT_COORDINATOR', isSystem: false, isActive: true })
    prismaMock.permission.count.mockResolvedValue(2)
    prismaMock.role.update.mockResolvedValue({ id: 'role-9', name: 'EVENT_COORDINATOR', permissions: [] })
    const response = await patchRole(request('/api/admin/roles/role-9', { permissionIds: ['perm-1', 'perm-2'] }), context('role-9'))
    expect(response.status).toBe(200)
    expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'role-9' } })
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalled()
  })

  it('refuses to delete system roles or roles with active assignments', async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'SUPER_ADMIN', isSystem: true })
    expect((await deleteRole(request('/api/admin/roles/x'), context('role-1'))).status).toBe(400)
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-9', name: 'EVENT_COORDINATOR', isSystem: false })
    prismaMock.roleAssignment.count.mockResolvedValue(3)
    expect((await deleteRole(request('/api/admin/roles/x'), context('role-9'))).status).toBe(409)
    prismaMock.roleAssignment.count.mockResolvedValue(0)
    expect((await deleteRole(request('/api/admin/roles/x'), context('role-9'))).status).toBe(200)
    expect(prismaMock.role.delete).toHaveBeenCalledWith({ where: { id: 'role-9' } })
  })

  it('requires roles:write for edits', async () => {
    getSessionMock.mockResolvedValue({ ...viewer, permissions: ['roles:read'] })
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-9', name: 'EVENT_COORDINATOR', isSystem: false, isActive: true })
    expect((await patchRole(request('/api/admin/roles/role-9', { displayName: 'Renamed' }), context('role-9'))).status).toBe(403)
  })
})
