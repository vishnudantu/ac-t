import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  approvalWorkflow: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  approvalStep: { count: jest.fn() },
  approvalStepDefinition: { deleteMany: jest.fn() },
  role: { findMany: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { PATCH as patchWorkflow } from '../src/app/api/approval-workflows/[id]/route'

const admin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Admin',
  roles: ['SUPER_ADMIN'], permissions: ['approvals:read', 'approvals:configure'],
}
const viewer: SessionPayload = {
  userId: 'user-2', email: 'viewer@example.test', fullName: 'Viewer',
  roles: ['AUDITOR'], permissions: ['approvals:read'],
}

const currentSteps = [
  { stepOrder: 1, name: 'Desk verification', approverRoleId: 'role-1', approverUserId: null },
  { stepOrder: 2, name: 'Secretary approval', approverRoleId: 'role-2', approverUserId: null },
]
const currentWorkflow = {
  id: 'wf-1', matchId: 'match-1', name: 'Two-level approval',
  isDefault: true, isActive: true, steps: currentSteps,
}
const reorderedSteps = [
  { stepOrder: 1, name: 'Secretary approval', approverRoleId: 'role-2', minQuantity: 0 },
  { stepOrder: 2, name: 'Desk verification', approverRoleId: 'role-1', minQuantity: 0 },
]

interface StepUpdate {
  stepOrder: number
  name: string
  approverRoleId?: string | null
  approverUserId?: string | null
}
interface WorkflowUpdateArgs {
  data: {
    name?: string
    isDefault?: boolean
    isActive?: boolean
    steps?: { create: StepUpdate[] }
  }
}
interface AuditCreateArgs {
  data: { oldValues: string; newValues: string; changedFields: string[] }
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/approval-workflows/wf-1', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}
function context() {
  return { params: Promise.resolve({ id: 'wf-1' }) }
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(admin)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.approvalWorkflow.findUnique.mockResolvedValue(currentWorkflow)
  prismaMock.approvalStep.count.mockResolvedValue(0)
  prismaMock.role.findMany.mockResolvedValue([{ id: 'role-1' }, { id: 'role-2' }])
  prismaMock.approvalWorkflow.update.mockImplementation(async (args: WorkflowUpdateArgs) => ({
    ...currentWorkflow,
    name: args.data.name ?? currentWorkflow.name,
    isDefault: args.data.isDefault ?? currentWorkflow.isDefault,
    isActive: args.data.isActive ?? currentWorkflow.isActive,
    steps: args.data.steps?.create ?? currentSteps,
  }))
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
})

describe('approval workflow step editing', () => {
  it('blocks step replacement when in-flight approval steps exist', async () => {
    prismaMock.approvalStep.count.mockResolvedValue(1)

    const response = await patchWorkflow(request({ steps: reorderedSteps }), context())

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(expect.objectContaining({ error: expect.stringMatching(/in-flight approval steps/) }))
    expect(prismaMock.approvalStep.count).toHaveBeenCalledWith({ where: { stepDefinition: { workflowId: 'wf-1' } } })
    expect(prismaMock.approvalStepDefinition.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.approvalWorkflow.update).not.toHaveBeenCalled()
  })

  it('reorders an unused workflow and audits old and new step summaries', async () => {
    const response = await patchWorkflow(request({ steps: reorderedSteps }), context())

    expect(response.status).toBe(200)
    expect(prismaMock.approvalStepDefinition.deleteMany).toHaveBeenCalledWith({ where: { workflowId: 'wf-1' } })
    expect(prismaMock.approvalWorkflow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        steps: { create: expect.arrayContaining([
          expect.objectContaining({ stepOrder: 1, name: 'Secretary approval' }),
          expect.objectContaining({ stepOrder: 2, name: 'Desk verification' }),
        ]) },
      }),
    }))
    const auditCall = prismaMock.auditEvent.create.mock.calls[0][0] as AuditCreateArgs
    expect(JSON.parse(auditCall.data.oldValues) as { steps: unknown }).toEqual(expect.objectContaining({
      steps: [
        { order: 1, name: 'Desk verification', roleId: 'role-1', userId: null },
        { order: 2, name: 'Secretary approval', roleId: 'role-2', userId: null },
      ],
    }))
    expect(JSON.parse(auditCall.data.newValues) as { steps: unknown }).toEqual(expect.objectContaining({
      steps: [
        { order: 1, name: 'Secretary approval', roleId: 'role-2', userId: null },
        { order: 2, name: 'Desk verification', roleId: 'role-1', userId: null },
      ],
    }))
  })

  it('rejects inactive approver roles without replacing steps', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'role-1' }])

    const response = await patchWorkflow(request({ steps: reorderedSteps }), context())

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(expect.objectContaining({ error: 'One or more approver roles are invalid or inactive' }))
    expect(prismaMock.approvalStepDefinition.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.approvalWorkflow.update).not.toHaveBeenCalled()
  })

  it('rejects duplicate and non-contiguous step orders', async () => {
    const duplicate = await patchWorkflow(request({
      steps: [{ ...reorderedSteps[0], stepOrder: 1 }, { ...reorderedSteps[1], stepOrder: 1 }],
    }), context())
    const gap = await patchWorkflow(request({
      steps: [{ ...reorderedSteps[0], stepOrder: 1 }, { ...reorderedSteps[1], stepOrder: 3 }],
    }), context())

    expect(duplicate.status).toBe(400)
    expect(gap.status).toBe(400)
    expect(prismaMock.approvalWorkflow.findUnique).not.toHaveBeenCalled()
  })

  it('requires approvals:configure to replace steps', async () => {
    getSessionMock.mockResolvedValue(viewer)

    const response = await patchWorkflow(request({ steps: reorderedSteps }), context())

    expect(response.status).toBe(403)
    expect(prismaMock.approvalWorkflow.findUnique).not.toHaveBeenCalled()
  })
})
