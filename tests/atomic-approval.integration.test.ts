import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as approve } from '@/app/api/approvals/route'
import { POST as distribute } from '@/app/api/distribution/route'
import { POST as cancel } from '@/app/api/allocations/[id]/cancel/route'

jest.mock('@/lib/auth', () => ({
  getSession: jest.fn(),
  hasPermission: (permissions: string[], permission: string) => permissions.includes(permission),
  hasRole: (roles: string[], role: string) => roles.includes(role),
}))
jest.mock('@/lib/notifications', () => ({ sendNotification: jest.fn() }))

const enabled = process.env.ACA_APPROVAL_INTEGRATION === '1'
const isolatedUrl = 'postgresql://aca_local@127.0.0.1:55479/aca_approval_test'
if (enabled && process.env.DATABASE_URL !== isolatedUrl) {
  throw new Error('Approval integration tests require the dedicated local aca_approval_test database')
}

const post = (path: string, body: object) => new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })

async function fixture(stock: number, quotaCap = stock) {
  const key = randomUUID()
  const user = await prisma.user.create({ data: { email: `${key}@example.test`, passwordHash: 'fixture', fullName: 'Test approver' } })
  jest.mocked(getSession).mockResolvedValue({
    userId: user.id, email: user.email, fullName: user.fullName, roles: [],
    permissions: ['approvals:decide', 'distribution:issue', 'allocations:confirm'],
  })
  const venue = await prisma.venue.create({ data: { name: key, shortName: 'Test', city: 'Test', state: 'Test' } })
  const match = await prisma.match.create({ data: { venueId: venue.id, title: key, format: 'T20', matchDate: new Date(), startTime: '10:00' } })
  const category = await prisma.ticketCategory.create({ data: { matchId: match.id, name: 'pavilion', displayName: 'Pavilion' } })
  const quota = await prisma.quotaPool.create({ data: {
    matchId: match.id, name: 'stakeholder', displayName: 'Stakeholder', totalAllocation: quotaCap,
    quotaAllocations: { create: { ticketCategoryId: category.id, allocatedQuantity: quotaCap } },
  } })
  const org = await prisma.organisation.create({ data: { name: key, category: 'TEST', quotaPoolId: quota.id } })
  const requester = await prisma.requester.create({ data: { fullName: 'Test requester', mobileNumber: key, requesterCategory: 'TEST', organisationId: org.id } })
  const pool = await prisma.inventoryPool.create({ data: {
    matchId: match.id, ticketCategoryId: category.id, standName: 'East', totalQuantity: stock, availableQuantity: stock,
  } })
  const workflow = await prisma.approvalWorkflow.create({ data: {
    matchId: match.id, name: 'Test workflow', steps: { create: { stepOrder: 1, name: 'Final' } },
  }, include: { steps: true } })
  async function request(quantity: number) {
    return prisma.request.create({ data: {
      requestNumber: randomUUID(), matchId: match.id, requesterId: requester.id, createdById: user.id, source: 'IN_PERSON',
      totalRequested: quantity, status: 'UNDER_REVIEW',
      items: { create: { ticketCategoryId: category.id, requestedQuantity: quantity } },
      approvalSteps: { create: {
        workflowId: workflow.id, stepDefinitionId: workflow.steps[0].id, stepOrder: 1, name: 'Final', status: 'IN_PROGRESS', assignedToId: user.id,
      } },
    }, include: { items: true, approvalSteps: true } })
  }
  return { request, pool, quota }
}

async function decide(record: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['request']>>, approved = record.totalRequested) {
  return approve(post('/api/approvals', {
    stepId: record.approvalSteps[0].id, action: approved === record.totalRequested ? 'APPROVE' : 'PARTIAL',
    remarks: 'Test decision', items: [{ requestItemId: record.items[0].id, approvedQuantity: approved }],
  }))
}

;(enabled ? describe : describe.skip)('approval lifecycle with isolated PostgreSQL', () => {
  afterAll(() => prisma.$disconnect())

  it('partially approves, consumes quota once, and issues from fully committed stock', async () => {
    const { pool, quota, request } = await fixture(5)
    const record = await request(7)
    expect((await decide(record, 5)).status).toBe(200)
    expect((await decide(record, 5)).status).toBe(409)
    expect(await prisma.request.findUnique({ where: { id: record.id } })).toMatchObject({
      status: 'PARTIALLY_APPROVED', fulfilmentStatus: 'ALLOCATED', totalApproved: 5, totalAllocated: 5,
    })
    const allocation = await prisma.allocation.findFirstOrThrow({ where: { requestId: record.id }, include: { items: true } })
    const issuance = { action: 'ISSUE', idempotencyKey: randomUUID(), items: [{
      allocationItemId: allocation.items[0].id, quantity: 2, recipientName: 'Collector',
    }] }
    const issue = await distribute(post('/api/distribution', issuance))
    expect(issue.status).toBe(201)
    const replay = await distribute(post('/api/distribution', issuance))
    expect(replay.status).toBe(201)
    expect((await replay.json()).issuances).toEqual((await issue.json()).issuances)
    const changed = { ...issuance, items: [{ ...issuance.items[0], quantity: 1 }] }
    expect((await distribute(post('/api/distribution', changed))).status).toBe(409)
    expect(await prisma.inventoryPool.findUnique({ where: { id: pool.id } })).toMatchObject({ availableQuantity: 0, allocatedQuantity: 5, issuedQuantity: 2 })
    expect(await prisma.quotaPool.findUnique({ where: { id: quota.id } })).toMatchObject({ consumedQuantity: 5 })
    expect(await prisma.request.findUnique({ where: { id: record.id } })).toMatchObject({ fulfilmentStatus: 'PARTIALLY_ISSUED', totalIssued: 2 })
    expect((await cancel(post('/api/cancel', { reason: 'Attempt after issuance' }), { params: Promise.resolve({ id: allocation.id }) })).status).toBe(409)
  })

  it('commits only one of two competing approvals and leaves the losing request pending', async () => {
    const { pool, request } = await fixture(5, 10)
    const records = [await request(5), await request(5)]
    const results = await Promise.all(records.map((record) => decide(record)))
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const losing = records[results.findIndex((result) => result.status === 409)]
    expect(await prisma.approvalStep.findUnique({ where: { id: losing.approvalSteps[0].id } })).toMatchObject({ status: 'IN_PROGRESS' })
    expect(await prisma.allocation.count({ where: { requestId: losing.id } })).toBe(0)
    expect(await prisma.inventoryPool.findUnique({ where: { id: pool.id } })).toMatchObject({ availableQuantity: 0, allocatedQuantity: 5 })
  })

  it('keeps intermediate approval stock-neutral and allocates multiple categories on the final step', async () => {
    const { pool, quota, request } = await fixture(8, 12)
    const record = await request(5)
    const first = record.approvalSteps[0]
    const category = await prisma.ticketCategory.create({ data: { matchId: pool.matchId, name: 'premium', displayName: 'Premium' } })
    const premium = await prisma.inventoryPool.create({ data: {
      matchId: pool.matchId, ticketCategoryId: category.id, standName: 'West', totalQuantity: 5, availableQuantity: 5,
    } })
    await prisma.quotaAllocation.create({ data: { quotaPoolId: quota.id, ticketCategoryId: category.id, allocatedQuantity: 5 } })
    const extra = await prisma.requestItem.create({ data: { requestId: record.id, ticketCategoryId: category.id, requestedQuantity: 3 } })
    await prisma.request.update({ where: { id: record.id }, data: { totalRequested: 8 } })
    const definition = await prisma.approvalStepDefinition.create({ data: { workflowId: first.workflowId, stepOrder: 2, name: 'Sign-off' } })
    const final = await prisma.approvalStep.create({ data: {
      requestId: record.id, workflowId: first.workflowId, stepDefinitionId: definition.id,
      stepOrder: 2, name: 'Sign-off', status: 'PENDING', assignedToId: first.assignedToId,
    } })
    const submit = (stepId: string) => approve(post('/api/approvals', {
      stepId, action: 'APPROVE', remarks: 'Test multi-category workflow',
      items: [{ requestItemId: record.items[0].id, approvedQuantity: 5 }, { requestItemId: extra.id, approvedQuantity: 3 }],
    }))
    expect((await submit(final.id)).status).toBe(409)
    expect((await submit(first.id)).status).toBe(200)
    expect(await prisma.allocation.count({ where: { requestId: record.id } })).toBe(0)
    expect(await prisma.inventoryPool.findUnique({ where: { id: pool.id } })).toMatchObject({ availableQuantity: 8 })
    expect(await prisma.quotaPool.findUnique({ where: { id: quota.id } })).toMatchObject({ consumedQuantity: 0 })
    expect((await submit(final.id)).status).toBe(200)
    expect(await prisma.inventoryPool.findUnique({ where: { id: premium.id } })).toMatchObject({ availableQuantity: 2 })
    expect(await prisma.request.findUnique({ where: { id: record.id } })).toMatchObject({ status: 'APPROVED', totalAllocated: 8 })
  })

  it('rolls back a quota shortage and releases stock and quota on cancellation exactly once', async () => {
    const { pool, quota, request } = await fixture(10, 4)
    const record = await request(5)
    const rejected = await decide(record)
    expect(rejected.status).toBe(409)
    expect((await rejected.json()).error).toMatch(/quota Stakeholder remaining: 4/i)
    expect(await prisma.approvalDecision.count({ where: { requestId: record.id } })).toBe(0)
    expect(await prisma.request.findUnique({ where: { id: record.id } })).toMatchObject({ version: 1, status: 'UNDER_REVIEW' })
    expect((await decide(record, 4)).status).toBe(200)
    const { id } = await prisma.allocation.findFirstOrThrow({ where: { requestId: record.id } })
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await cancel(post('/api/cancel', { reason: 'Cancelled by test' }), { params: Promise.resolve({ id }) })).status).toBe(200)
    }
    expect(await prisma.inventoryPool.findUnique({ where: { id: pool.id } })).toMatchObject({ availableQuantity: 10, allocatedQuantity: 0 })
    expect(await prisma.quotaPool.findUnique({ where: { id: quota.id } })).toMatchObject({ consumedQuantity: 0 })
    expect(await prisma.request.findUnique({ where: { id: record.id } })).toMatchObject({ fulfilmentStatus: 'CANCELLED', totalAllocated: 0 })
  })
})
