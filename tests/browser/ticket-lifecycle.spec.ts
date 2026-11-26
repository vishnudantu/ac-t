import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const email = 'browser-tester@example.test'
const password = process.env.ACA_E2E_PASSWORD!
let officerId: string

test.beforeAll(async () => {
  const permissions = [
    'matches:read', 'requests:read', 'requests:write', 'approvals:read', 'approvals:decide',
    'allocations:read', 'allocations:confirm', 'distribution:read', 'distribution:issue',
  ]
  const role = await prisma.role.upsert({ where: { name: 'BROWSER_TESTER' }, update: {}, create: {
    name: 'BROWSER_TESTER', displayName: 'Browser tester',
    permissions: { create: permissions.map((key) => ({
      permission: { create: { key, displayName: key, category: 'Browser tests' } },
    })) },
  } })
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: {
    email, fullName: 'Browser tester', passwordHash: await bcrypt.hash(password, 10),
    roleAssignments: { create: { roleId: role.id, scope: 'GLOBAL' } },
  } })
  officerId = user.id
})

test.afterAll(async () => { await prisma.$disconnect() })

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/)
})

async function createFixture(stock = 10) {
  const key = randomUUID()
  const match = await prisma.match.create({ data: {
    title: 'Test match ' + key, format: 'T20', matchDate: new Date(Date.now() + 86_400_000), startTime: '10:00',
    venue: { create: { name: 'Test venue ' + key, shortName: 'Test', city: 'Test', state: 'Test' } },
  } })
  const category = await prisma.ticketCategory.create({ data: { matchId: match.id, name: 'pavilion', displayName: 'Pavilion' } })
  const quota = await prisma.quotaPool.create({ data: {
    matchId: match.id, name: 'test-quota', displayName: 'Test quota', totalAllocation: 10,
    quotaAllocations: { create: { ticketCategoryId: category.id, allocatedQuantity: 10 } },
  } })
  const requester = await prisma.requester.create({ data: {
    fullName: 'Synthetic requester ' + key, mobileNumber: '+919000000001', requesterCategory: 'OTHER',
    organisation: { create: { name: 'Test organisation ' + key, category: 'OTHER', quotaPoolId: quota.id } },
  } })
  const pool = await prisma.inventoryPool.create({ data: {
    matchId: match.id, ticketCategoryId: category.id, standName: 'East', totalQuantity: stock, availableQuantity: stock,
  } })
  await prisma.approvalWorkflow.create({ data: {
    matchId: match.id, name: 'Test workflow', isDefault: true,
    steps: { create: { stepOrder: 1, name: 'Final approval', approverUserId: officerId } },
  } })
  return { match, category, quota, requester, pool }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function submitRequest(page: Page, fixture: Fixture, quantity = 5) {
  await page.goto('/requests/new')
  await page.getByLabel('Match').selectOption(fixture.match.id)
  await page.getByLabel(/^Requester\b/).selectOption(fixture.requester.id)
  await page.getByLabel('Category 1').selectOption(fixture.category.id)
  await page.getByLabel('Quantity').fill(String(quantity))
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page).toHaveURL(/\/requests\/(?!new)[^/?]+$/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  return prisma.request.findUniqueOrThrow({ where: { id } })
}

async function decide(page: Page, requestNumber: string) {
  await page.goto('/approvals')
  await page.getByLabel('Filter approval steps on this page').fill(requestNumber)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Approve request' })
  const quantity = dialog.getByRole('spinbutton', { name: 'Pavilion' })
  await expect(quantity).toHaveValue('5')
  await expect(quantity).not.toBeEditable()
  await dialog.getByLabel(/^Remarks\b/).fill('Verified by the browser test')
  await dialog.getByRole('button', { name: 'Approve request', exact: true }).click()
  return dialog
}

async function approve(page: Page, request: Awaited<ReturnType<typeof submitRequest>>) {
  const dialog = await decide(page, request.requestNumber)
  await expect(dialog).toBeHidden()
  return prisma.allocation.findFirstOrThrow({ where: { requestId: request.id }, include: { items: true } })
}

async function expectBalances(fixture: Fixture, available: number, allocated: number, issued: number, consumed: number) {
  expect(await prisma.inventoryPool.findUniqueOrThrow({ where: { id: fixture.pool.id } })).toMatchObject({
    availableQuantity: available, allocatedQuantity: allocated, issuedQuantity: issued,
  })
  expect(await prisma.quotaPool.findUniqueOrThrow({ where: { id: fixture.quota.id } })).toMatchObject({ consumedQuantity: consumed })
  expect(await prisma.quotaAllocation.findUniqueOrThrow({ where: { quotaPoolId_ticketCategoryId: {
    quotaPoolId: fixture.quota.id, ticketCategoryId: fixture.category.id,
  } } })).toMatchObject({ consumedQuantity: consumed })
}

test('submitting a request leaves inventory and quota available', async ({ page }) => {
  const fixture = await createFixture()
  const request = await submitRequest(page, fixture)
  expect(request).toMatchObject({ status: 'UNDER_REVIEW', totalRequested: 5, totalAllocated: 0 })
  expect(await prisma.allocation.count({ where: { requestId: request.id } })).toBe(0)
  await expectBalances(fixture, 10, 0, 0, 0)
})

test('final approval creates a confirmed allocation and consumes stock and quota', async ({ page }) => {
  const fixture = await createFixture()
  const request = await submitRequest(page, fixture)
  const allocation = await approve(page, request)
  expect(allocation).toMatchObject({ status: 'CONFIRMED', totalQuantity: 5 })
  expect(await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
    status: 'APPROVED', fulfilmentStatus: 'ALLOCATED', totalApproved: 5, totalAllocated: 5,
  })
  await page.goto('/allocations')
  const article = page.getByRole('article').filter({ hasText: request.requestNumber })
  await expect(article.getByText('Confirmed', { exact: true }).first()).toBeVisible()
  await expectBalances(fixture, 5, 5, 0, 5)
})

test('partial issuance leaves available stock and quota unchanged', async ({ page }) => {
  const fixture = await createFixture()
  const request = await submitRequest(page, fixture)
  const allocation = await approve(page, request)
  await page.goto('/distribution')
  await page.getByRole('button', { name: 'Issue tickets', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Issue tickets' })
  await dialog.getByLabel('Confirmed allocation item').selectOption(allocation.items[0].id)
  await dialog.getByLabel('Quantity').fill('2')
  await dialog.getByLabel('Recipient name').fill('Synthetic collector')
  await dialog.getByRole('button', { name: 'Issue tickets' }).click()
  await expect(dialog).toBeHidden()
  const issuance = await prisma.ticketIssuance.findFirstOrThrow({ where: { allocationItemId: allocation.items[0].id } })
  expect(issuance.quantity).toBe(2)
  expect(await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
    totalIssued: 2, fulfilmentStatus: 'PARTIALLY_ISSUED',
  })
  await expectBalances(fixture, 5, 5, 2, 5)
})

test('cancelling an unissued allocation releases inventory and quota', async ({ page }) => {
  const fixture = await createFixture()
  const request = await submitRequest(page, fixture)
  await approve(page, request)
  await expectBalances(fixture, 5, 5, 0, 5)
  await page.goto('/allocations')
  const article = page.getByRole('article').filter({ hasText: request.requestNumber })
  await article.getByRole('button', { name: 'Cancel allocation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel allocation' })
  await dialog.getByLabel('Reason').fill('Synthetic cancellation')
  await dialog.getByRole('button', { name: 'Cancel allocation' }).click()
  await expect(dialog).toBeHidden()
  await expect(article.getByText('Cancelled', { exact: true })).toBeVisible()
  expect(await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
    status: 'CANCELLED', totalAllocated: 0,
  })
  await expectBalances(fixture, 10, 0, 0, 0)
})

test('insufficient stock is shown in the approval dialog without committing anything', async ({ page }) => {
  const fixture = await createFixture(2)
  const request = await submitRequest(page, fixture)
  const dialog = await decide(page, request.requestNumber)
  await expect(dialog.getByText(/shortage 3/i)).toBeVisible()
  expect(await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({
    status: 'UNDER_REVIEW', totalApproved: 0, totalAllocated: 0,
  })
  expect(await prisma.allocation.count({ where: { requestId: request.id } })).toBe(0)
  await expectBalances(fixture, 2, 0, 0, 0)
})
