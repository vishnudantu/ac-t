import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  quotaTemplate: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
  quotaPool: { count: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))

const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({
  ...jest.requireActual('../src/lib/auth'),
  getSession: getSessionMock,
}))

import { GET as listTemplates, POST as createTemplate } from '../src/app/api/quota-templates/route'
import { PATCH as patchTemplate, DELETE as deleteTemplate } from '../src/app/api/quota-templates/[id]/route'

const admin: SessionPayload = {
  userId: 'admin-1', email: 'admin@example.test', fullName: 'Admin',
  roles: ['SUPER_ADMIN'], permissions: ['quotas:read', 'quotas:write'],
}
const viewer: SessionPayload = {
  userId: 'user-2', email: 'viewer@example.test', fullName: 'Viewer',
  roles: ['AUDITOR'], permissions: ['quotas:read'],
}

function request(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
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
  prismaMock.quotaTemplate.create.mockResolvedValue({ id: 'tpl-1', name: 'APEX_ALLOCATION', displayName: 'Apex Allocation' })
  prismaMock.quotaTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', name: 'APEX_ALLOCATION', displayName: 'Apex Allocation', isActive: true })
  prismaMock.quotaTemplate.update.mockResolvedValue({ id: 'tpl-1', displayName: 'Renamed' })
})

describe('quota template management', () => {
  it('lists active templates', async () => {
    prismaMock.quotaTemplate.findMany.mockResolvedValue([{ id: 'tpl-1', name: 'APEX_ALLOCATION' }])
    expect((await listTemplates(new NextRequest('http://localhost/api/quota-templates'), admin as never)).status).toBe(200)
  })

  it('normalises the name and creates a template with an audit event', async () => {
    const response = await createTemplate(request('/api/quota-templates', { name: 'district collector', displayName: 'District Collector Allocation' }))
    expect(response.status).toBe(201)
    expect(prismaMock.quotaTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'DISTRICT_COLLECTOR' }) }))
    expect(prismaMock.auditEvent.create).toHaveBeenCalled()
  })

  it('requires quotas:write to create or edit', async () => {
    getSessionMock.mockResolvedValue(viewer)
    expect((await createTemplate(request('/api/quota-templates', { name: 'X', displayName: 'X Allocation' }))).status).toBe(403)
    expect((await patchTemplate(request('/api/quota-templates/tpl-1', { displayName: 'Renamed' }), context('tpl-1'))).status).toBe(403)
  })

  it('blocks deleting a template that match quotas reference', async () => {
    prismaMock.quotaPool.count.mockResolvedValue(3)
    expect((await deleteTemplate(request('/api/quota-templates/tpl-1'), context('tpl-1'))).status).toBe(409)
    prismaMock.quotaPool.count.mockResolvedValue(0)
    expect((await deleteTemplate(request('/api/quota-templates/tpl-1'), context('tpl-1'))).status).toBe(200)
    expect(prismaMock.quotaTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } })
  })

  it('restricts deletion to super administrators', async () => {
    getSessionMock.mockResolvedValue({ ...admin, roles: ['QUOTA_CONTROLLER'], permissions: ['quotas:read', 'quotas:write'] })
    expect((await deleteTemplate(request('/api/quota-templates/tpl-1'), context('tpl-1'))).status).toBe(403)
  })
})
