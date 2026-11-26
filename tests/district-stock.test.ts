import { NextRequest } from 'next/server'
import { POST } from '@/app/api/integrations/district/route'
import { prisma } from '@/lib/prisma'
import { getIntegrationConfig } from '@/lib/integrations'

jest.mock('@/lib/prisma', () => ({
  prisma: { inventoryPool: { aggregate: jest.fn() }, $transaction: jest.fn() },
}))
jest.mock('@/lib/integrations', () => ({
  ...jest.requireActual('@/lib/integrations'),
  getIntegrationConfig: jest.fn(),
}))

const scope = { matchId: 'match-1', ticketCategoryId: 'category-1', ticketPurpose: 'PURCHASE', isQuotaPool: false, quotaPoolId: null }
const request = (event: 'VALIDATE' | 'SALE' | 'REFUND') => new NextRequest('http://localhost/api/integrations/district', {
  method: 'POST',
  headers: { authorization: 'Bearer example-test-secret' },
  body: JSON.stringify({
    event, items: [{ matchId: 'match-1', ticketCategoryId: 'category-1', externalOrderId: 'order-1', quantity: 2 }],
  }),
})

beforeEach(() => {
  jest.mocked(getIntegrationConfig).mockResolvedValue({
    'integration.district.webhook_secret': 'example-test-secret',
    'integration.district.live': 'true',
  })
})

it('validates against available unrestricted purchase stock only', async () => {
  jest.mocked(prisma.inventoryPool.aggregate).mockResolvedValue({ _sum: { availableQuantity: 3 } } as never)
  const response = await POST(request('VALIDATE'))
  expect((await response.json()).results[0]).toMatchObject({ remaining: 3, reason: 'validated', applied: false })
  expect(prisma.inventoryPool.aggregate).toHaveBeenCalledWith({ where: scope, _sum: { availableQuantity: true } })
  expect(prisma.$transaction).not.toHaveBeenCalled()
})

it('checks available purchase stock at write time and leaves no sale audit if the balance changes', async () => {
  const tx = {
    inventoryPool: { findMany: jest.fn().mockResolvedValue([{ id: 'pool-1', availableQuantity: 3 }]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
  }
  jest.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))
  const response = await POST(request('SALE'))
  expect((await response.json()).results[0]).toMatchObject({ applied: false, reason: 'Inventory changed; retry sale' })
  expect(tx.inventoryPool.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { ...scope, id: 'pool-1', availableQuantity: { gte: 2 } },
  }))
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  expect(tx.auditEvent.create).not.toHaveBeenCalled()
})

it('does not release stock for an unverified refund', async () => {
  const response = await POST(request('REFUND'))
  expect((await response.json()).results[0]).toMatchObject({ applied: false, reason: 'refund_requires_reconciliation' })
  expect(prisma.$transaction).not.toHaveBeenCalled()
})
