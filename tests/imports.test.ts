import { NextRequest } from 'next/server'
import type { SessionPayload } from '../src/lib/auth-core'

const prismaMock = {
  importJob: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  importRow: { createMany: jest.fn() },
  organisation: { upsert: jest.fn() },
  requester: { findFirst: jest.fn(), create: jest.fn() },
  match: { findFirst: jest.fn(), update: jest.fn() },
  ticketCategory: { findFirst: jest.fn() },
  inventoryPool: { create: jest.fn(), aggregate: jest.fn() },
  quotaPool: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  quotaAllocation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
  request: { findMany: jest.fn(), create: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }))
const getSessionMock = jest.fn<Promise<SessionPayload | null>, []>()
jest.mock('../src/lib/auth', () => ({ ...jest.requireActual('../src/lib/auth'), getSession: getSessionMock }))

import { POST as createImport } from '../src/app/api/imports/route'

const permissions: Record<string, string> = { REQUESTS: 'requests:bulk_import', REQUESTERS: 'requests:write', INVENTORY: 'inventory:import', QUOTAS: 'quotas:write' }
const user: SessionPayload = { userId: 'user-1', email: 'operator@example.test', fullName: 'Operator', roles: ['REQUEST_DESK_OPERATOR'], permissions: Object.values(permissions) }
const headers = 'Full Name,Mobile Number,Email,Designation,Organisation,Category,Protocol Level,Preferred Contact'
const requester = '"Mr. Test","+919876500002","test@example.test","Secretary","Test Association","VIP","2","PHONE"'

function upload(type: string, contents: string, name = 'upload.csv'): NextRequest {
  const form = new FormData()
  form.set('type', type)
  form.set('file', new File([contents], name, { type: 'text/csv' }))
  return new NextRequest('http://localhost/api/imports', { method: 'POST', body: form })
}

beforeEach(() => {
  getSessionMock.mockResolvedValue(user)
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock))
  prismaMock.organisation.upsert.mockResolvedValue({ id: 'org-1' })
  prismaMock.requester.findFirst.mockResolvedValue(null)
  prismaMock.requester.create.mockResolvedValue({ id: 'requester-1' })
  prismaMock.importJob.create.mockResolvedValue({ id: 'job-1' })
  prismaMock.importRow.createMany.mockResolvedValue({ count: 1 })
  prismaMock.auditEvent.create.mockResolvedValue({ id: 'audit-1' })
  prismaMock.match.findFirst.mockResolvedValue({ id: 'match-1' })
  prismaMock.ticketCategory.findFirst.mockResolvedValue({ id: 'category-1' })
  prismaMock.inventoryPool.create.mockResolvedValue({ id: 'pool-1' })
  prismaMock.inventoryPool.aggregate.mockResolvedValue({ _sum: { totalQuantity: 100 } })
  prismaMock.quotaAllocation.aggregate.mockResolvedValue({ _sum: { allocatedQuantity: 0 } })
  prismaMock.quotaPool.findUnique.mockResolvedValue(null)
  prismaMock.quotaPool.create.mockResolvedValue({ id: 'quota-1' })
  prismaMock.quotaAllocation.findUnique.mockResolvedValue(null)
  prismaMock.request.findMany.mockResolvedValue([])
  prismaMock.request.create.mockResolvedValue({ id: 'request-1' })
})

describe('bulk imports', () => {
  it.each(Object.entries(permissions))('requires %s permission for %s', async (type, permission) => {
    getSessionMock.mockResolvedValue({ ...user, permissions: Object.values(permissions).filter((key) => key !== permission) })
    expect((await createImport(upload(type, `${headers}\n${requester}`))).status).toBe(403)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a wrong extension before parsing', async () => {
    const response = await createImport(upload('REQUESTERS', `${headers}\n${requester}`, 'upload.txt'))
    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects files larger than 5MB before parsing', async () => {
    const form = new FormData()
    form.set('type', 'REQUESTERS')
    form.set('file', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv'))
    const request = new NextRequest('http://localhost/api/imports', { method: 'POST', body: form })
    expect((await createImport(request)).status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('imports requesters and records counters, rows, and an import audit', async () => {
    const response = await createImport(upload('REQUESTERS', `${headers}\n${requester}`))
    expect(response.status).toBe(201)
    expect(prismaMock.requester.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fullName: 'Mr. Test', organisationId: 'org-1', requesterCategory: 'VIP' }) }))
    expect(prismaMock.importJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ importType: 'REQUESTERS', totalRows: 1, validRows: 1, invalidRows: 0, importedRows: 1, duplicateRows: 0, status: 'COMPLETED' }) })
    expect(prismaMock.importRow.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ rowNumber: 2, status: 'IMPORTED' })] })
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: 'IMPORT_JOB' }) })
  })

  it('counts an existing requester as a duplicate without importing it', async () => {
    prismaMock.requester.findFirst.mockResolvedValue({ id: 'requester-existing' })
    const response = await createImport(upload('REQUESTERS', `${headers}\n${requester}`))
    expect(response.status).toBe(201)
    expect(prismaMock.requester.create).not.toHaveBeenCalled()
    expect(prismaMock.importJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ duplicateRows: 1, importedRows: 0, status: 'PARTIAL' }) })
  })

  it('marks an entirely invalid import failed with an error summary', async () => {
    const response = await createImport(upload('REQUESTERS', `${headers}\n"X","bad","bad","","Org","VIP","2","PHONE"`))
    expect(response.status).toBe(201)
    expect(prismaMock.importJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'FAILED', invalidRows: 1, importedRows: 0, errorSummary: expect.stringMatching(/1 row\(s\) invalid/) }) })
    expect(prismaMock.requester.create).not.toHaveBeenCalled()
  })

  it('writes no job records when the transaction fails', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('Database unavailable'))
    const response = await createImport(upload('REQUESTERS', `${headers}\n${requester}`))
    expect(response.status).toBe(500)
    expect(prismaMock.importJob.create).not.toHaveBeenCalled()
    expect(prismaMock.importRow.createMany).not.toHaveBeenCalled()
    expect(prismaMock.auditEvent.create).not.toHaveBeenCalled()
  })
})
