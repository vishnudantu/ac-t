jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}))
jest.mock('@/lib/auth', () => ({
  ...jest.requireActual('@/lib/auth'),
  getSession: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/quotas/route'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const request = () => new NextRequest('http://localhost/api/quotas?matchId=match-1&limit=1')
const session = {
  userId: 'tester', email: 'tester@example.test', fullName: 'Tester', roles: [],
  permissions: ['quotas:read', 'inventory:read'],
}
const category = { ticketCategory: { id: 'cat-1', displayName: 'Suite' }, match: { title: 'Match 1' } }

function setup() {
  const tx = {
    quotaPool: {
      findMany: jest.fn().mockResolvedValue([{ totalAllocation: 2, consumedQuantity: 1 }]),
      count: jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAllocation: 40, consumedQuantity: 6 } }),
    },
    inventoryPool: { findMany: jest.fn().mockResolvedValue([
      { ...category, ticketPurpose: 'COMPLIMENTARY', totalQuantity: 2, complimentaryQuantity: 0, purchaseQuantity: 0 },
      { ...category, ticketPurpose: 'PURCHASE', totalQuantity: 5, complimentaryQuantity: 0, purchaseQuantity: 0 },
      { ...category, ticketPurpose: 'MIXED', totalQuantity: 8, complimentaryQuantity: 3, purchaseQuantity: 5 },
      { ...category, ticketPurpose: 'MIXED', totalQuantity: 4, complimentaryQuantity: 0, purchaseQuantity: 0 },
    ]) },
  }
  jest.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never))
  return tx
}

it('uses all matching quota pools for totals and classifies stock from inventory instead of quota quantities', async () => {
  jest.mocked(getSession).mockResolvedValue(session)
  const tx = setup()
  const response = await GET(request())

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    total: 3,
    totals: { allocation: 40, consumed: 6 },
    inventoryByCategory: [{
      categoryId: 'cat-1', match: 'Match 1', category: 'Suite', complimentary: 5, purchase: 10, unclassified: 4,
    }],
  })
  expect(tx.quotaPool.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
  expect(tx.quotaPool.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { matchId: 'match-1' } }))
  expect(tx.inventoryPool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { matchId: 'match-1' } }))
})

it('keeps inventory classification behind the inventory read permission', async () => {
  jest.mocked(getSession).mockResolvedValue({ ...session, permissions: ['quotas:read'] })
  const tx = setup()
  const response = await GET(request())

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ inventoryByCategory: null })
  expect(tx.inventoryPool.findMany).not.toHaveBeenCalled()
})
