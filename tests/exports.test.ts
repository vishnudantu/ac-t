import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  exportJob: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  request: { findMany: jest.fn(), aggregate: jest.fn() },
  allocation: { findMany: jest.fn() },
  inventoryPool: { findMany: jest.fn(), aggregate: jest.fn() },
  quotaPool: { findMany: jest.fn(), aggregate: jest.fn() },
  ticketIssuance: { findMany: jest.fn() },
  ticketCategory: { findMany: jest.fn() },
  auditEvent: { findMany: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))
const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({ ...jest.requireActual('../src/lib/auth'), getSession: getSessionMock }))

import { POST as createExport } from '../src/app/api/exports/route'

const permissions: Record<string, string> = { REQUESTS: 'requests:export', AUDIT: 'audit:export', REPORTS: 'reports:export', ALLOCATIONS: 'allocations:read', INVENTORY: 'inventory:read', QUOTAS: 'quotas:read', DISTRIBUTION: 'distribution:read' }
const user: SessionPayload = { userId: 'admin-1', email: 'admin@example.test', fullName: 'Admin', roles: ['SUPER_ADMIN'], permissions: Object.values(permissions) }
function exportRequest(type: string, filters?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/exports', { method: 'POST', body: JSON.stringify({ type, format: 'CSV', ...(filters ? { filters } : {}) }) })
}
const aggregate = { _sum: { totalRequested: 0, totalApproved: 0, totalAllocated: 0, totalIssued: 0, totalDelivered: 0, totalQuantity: 0, availableQuantity: 0, totalAllocation: 0, consumedQuantity: 0 } }

beforeEach(() => {
  getSessionMock.mockResolvedValue(user)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.request.findMany.mockResolvedValue([])
  prismaMock.allocation.findMany.mockResolvedValue([])
  prismaMock.inventoryPool.findMany.mockResolvedValue([])
  prismaMock.quotaPool.findMany.mockResolvedValue([])
  prismaMock.ticketIssuance.findMany.mockResolvedValue([])
  prismaMock.auditEvent.findMany.mockResolvedValue([])
  prismaMock.ticketCategory.findMany.mockResolvedValue([])
  prismaMock.request.aggregate.mockResolvedValue(aggregate)
  prismaMock.inventoryPool.aggregate.mockResolvedValue(aggregate)
  prismaMock.quotaPool.aggregate.mockResolvedValue(aggregate)
  prismaMock.exportJob.create.mockResolvedValue({ id: 'export-1' })
})

describe('bulk exports', () => {
  it.each(Object.entries(permissions))('requires %s permission for %s', async (type, permission) => {
    getSessionMock.mockResolvedValue({ ...user, permissions: Object.values(permissions).filter((key) => key !== permission) })
    expect((await createExport(exportRequest(type))).status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('records a completed job with record count and server filename', async () => {
    prismaMock.request.findMany.mockResolvedValue([{ requestNumber: 'REQ-1', status: 'DRAFT', priority: 'NORMAL', totalRequested: 2, totalApproved: 0, totalAllocated: 0, totalIssued: 0, createdAt: new Date(), match: { title: 'Match' }, requester: { fullName: 'Requester', mobileNumber: '+919999999999', email: null }, items: [] }])
    const response = await createExport(exportRequest('REQUESTS'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="aca-ticketops-requests-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(prismaMock.exportJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ exportType: 'REQUESTS', format: 'CSV', recordCount: 1, fileName: expect.stringMatching(/^aca-ticketops-requests-.*\.csv$/), fileSize: expect.any(Number), status: 'COMPLETED' }) })
  })

  it('escapes formula injection in CSV cells', async () => {
    prismaMock.request.findMany.mockResolvedValue([{ requestNumber: '=cmd()', status: 'DRAFT', priority: 'NORMAL', totalRequested: 2, totalApproved: 0, totalAllocated: 0, totalIssued: 0, createdAt: new Date(), match: { title: 'Match' }, requester: { fullName: '+danger', mobileNumber: '+919999999999', email: null }, items: [] }])
    const response = await createExport(exportRequest('REQUESTS'))
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const text = Buffer.from(bytes).toString('utf8')
    expect(text).toContain('"\'=cmd()"')
    expect(text).toContain('"\'+danger"')
  })

  it('applies audit action and search filters', async () => {
    await createExport(exportRequest('AUDIT', { action: 'CREATE', search: 'request-1' }))
    expect(prismaMock.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: 'CREATE', OR: expect.arrayContaining([{ entityId: { contains: 'request-1', mode: 'insensitive' } }]) }), take: 5000 }))
  })
})
