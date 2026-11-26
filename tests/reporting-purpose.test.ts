jest.mock('@/lib/prisma', () => ({
  prisma: {
    request: { aggregate: jest.fn() }, match: { findMany: jest.fn() },
    inventoryPool: { findMany: jest.fn(), aggregate: jest.fn() }, quotaPool: { aggregate: jest.fn() },
    allocation: { aggregate: jest.fn() }, ticketIssuance: { aggregate: jest.fn() },
    ticketCategory: { findMany: jest.fn() }, systemSetting: { findUnique: jest.fn() },
    requestItem: { aggregate: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({
  ...jest.requireActual('@/lib/auth'),
  getSession: jest.fn(),
}))
jest.mock('@/lib/integrations', () => ({
  getIntegrationConfig: jest.fn().mockResolvedValue({}),
  configValue: jest.fn().mockReturnValue('499'),
}))

import { NextRequest } from 'next/server'
import { GET as reports } from '@/app/api/reports/route'
import { GET as revenue } from '@/app/api/revenue/route'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

beforeEach(() => {
  jest.mocked(getSession).mockResolvedValue({
    userId: 'tester', email: 'tester@example.test', fullName: 'Tester', roles: [], permissions: ['reports:read'],
  })
  const aggregate = { _count: { _all: 0 }, _sum: {} }
  jest.mocked(prisma.request.aggregate).mockResolvedValue(aggregate as never)
  jest.mocked(prisma.inventoryPool.aggregate).mockResolvedValue(aggregate as never)
  jest.mocked(prisma.quotaPool.aggregate).mockResolvedValue(aggregate as never)
  jest.mocked(prisma.allocation.aggregate).mockResolvedValue(aggregate as never)
  jest.mocked(prisma.ticketIssuance.aggregate).mockResolvedValue(aggregate as never)
  jest.mocked(prisma.requestItem.aggregate).mockResolvedValue({ _sum: { approvedQuantity: 9, issuedQuantity: 6, allocatedQuantity: 8 } } as never)
  jest.mocked(prisma.ticketCategory.findMany).mockResolvedValue([])
  jest.mocked(prisma.systemSetting.findUnique).mockResolvedValue({ value: '499' } as never)
  const match = { id: 'match-1', title: 'Home match' }
  jest.mocked(prisma.match.findMany).mockResolvedValue([match] as never)
  const common = { match, ticketCategory: { displayName: 'Suite' } }
  jest.mocked(prisma.inventoryPool.findMany).mockResolvedValue([
    { ...common, ticketPurpose: 'COMPLIMENTARY', issuedQuantity: 1, faceValue: 1200 },
    { ...common, ticketPurpose: 'PURCHASE', issuedQuantity: 2, faceValue: 900 },
    { ...common, ticketPurpose: 'MIXED', issuedQuantity: 3, faceValue: 800 },
  ] as never)
})

it('reports each issued ticket once and excludes unclassified issuance from purpose values', async () => {
  const response = await reports(new NextRequest('http://localhost/api/reports?matchId=match-1'))
  expect(response.status).toBe(200)
  expect((await response.json()).summary.purposeBreakdown).toEqual({
    COMPLIMENTARY: { pools: 1, issued: 1, value: 499 },
    PURCHASE: { pools: 1, issued: 2, value: 1800 },
    UNCLASSIFIED: { pools: 1, issued: 3, value: 0 },
  })
})

it('returns match IDs and keeps mixed issuance out of revenue while preserving the total issued count', async () => {
  const response = await revenue(new NextRequest('http://localhost/api/revenue?matchId=match-1'))
  expect(response.status).toBe(200)
  expect(prisma.inventoryPool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { matchId: 'match-1' } }))
  expect(await response.json()).toMatchObject({
    matches: [{ id: 'match-1', title: 'Home match' }],
    totals: { complimentaryIssued: 1, saleIssued: 2, unclassifiedIssued: 3, totalIssued: 6, totalRevenue: 2299, pendingAllocated: 2 },
  })
})
