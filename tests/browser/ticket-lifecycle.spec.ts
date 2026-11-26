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
    'inventory:read', 'quotas:read', 'reports:read', 'users:read', 'users:write', 'users:assign_roles',
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

async function createFixture(stock = 10, approverId = officerId) {
  const key = randomUUID()
  const match = await prisma.match.create({ data: {
    title: 'Test match ' + key, format: 'T20', matchDate: new Date(Date.now() + 86_400_000), startTime: '10:00',
    venue: { create: { name: 'Test venue ' + key, shortName: 'Test', city: 'Test', state: 'Test' } },
  } })
  const category = await prisma.ticketCategory.create({ data: { matchId: match.id, name: 'suite-5', displayName: 'Suite-5' } })
  const quota = await prisma.quotaPool.create({ data: {
    matchId: match.id, name: 'test-quota', displayName: 'Test quota', totalAllocation: 10,
    quotaAllocations: { create: { ticketCategoryId: category.id, allocatedQuantity: 10 } },
  } })
  const requester = await prisma.requester.create({ data: {
    fullName: 'Synthetic requester ' + key, mobileNumber: '+919000000001', requesterCategory: 'OTHER',
    organisation: { create: { name: 'Test organisation ' + key, category: 'OTHER', quotaPoolId: quota.id } },
  } })
  const pool = await prisma.inventoryPool.create({ data: {
    matchId: match.id, ticketCategoryId: category.id, standName: 'Suite-5', totalQuantity: stock, availableQuantity: stock,
  } })
  await prisma.approvalWorkflow.create({ data: {
    matchId: match.id, name: 'Test workflow', isDefault: true,
    steps: { create: { stepOrder: 1, name: 'Final approval', approverUserId: approverId } },
  } })
  return { match, category, quota, requester, pool }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function submitRequest(page: Page, fixture: Fixture, quantity = 5, explicitType?: 'COMPLIMENTARY' | 'PURCHASE') {
  await page.goto('/requests/new')
  await page.getByRole('combobox', { name: /^Match\s*\*?$/ }).selectOption(fixture.match.id)
  await page.getByRole('combobox', { name: /^Requester\s*\*?$/ }).selectOption(fixture.requester.id)
  await page.getByRole('combobox', { name: /^Category 1\s*\*?$/ }).selectOption(fixture.category.id)
  await page.getByRole('spinbutton', { name: /^Quantity\s*\*?$/ }).fill(String(quantity))
  const type = page.getByRole('combobox', { name: /^Ticket type/ })
  if (explicitType) await type.selectOption(explicitType)
  else await expect(type.locator('option:checked')).toContainText('From inventory')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page).toHaveURL(/\/requests\/(?!new)[^/?]+$/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  return prisma.request.findUniqueOrThrow({ where: { id } })
}

async function decide(page: Page, requestNumber: string, requestedQuantity = 5) {
  await page.goto('/approvals')
  await page.getByLabel('Filter approval steps on this page').fill(requestNumber)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Approve request' })
  const quantity = dialog.getByRole('spinbutton', { name: 'Suite-5' })
  await expect(quantity).toHaveValue(String(requestedQuantity))
  await expect(quantity).not.toBeEditable()
  await dialog.getByLabel(/^Remarks\b/).fill('Verified by the browser test')
  await dialog.getByRole('button', { name: 'Approve request', exact: true }).click()
  return dialog
}

async function approve(page: Page, request: Awaited<ReturnType<typeof submitRequest>>) {
  const dialog = await decide(page, request.requestNumber, request.totalRequested)
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
  await page.goto('/reports')
  await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(fixture.match.id)
  const view = page.getByRole('combobox', { name: 'Report', exact: true })
  await view.selectOption('pools')
  const pool = page.getByRole('row').filter({ hasText: fixture.match.title })
  await expect(pool.getByRole('cell').nth(13)).toHaveText('5')
  await expect(pool.getByRole('cell').nth(15)).toHaveText('3')
  await expect(pool.getByRole('cell').nth(16)).toHaveText('2')
  await view.selectOption('allocations')
  const allocationRow = page.getByRole('row').filter({ hasText: allocation.allocationNumber })
  await expect(allocationRow.getByRole('cell').nth(7)).toHaveText('5')
  await expect(allocationRow.getByRole('cell').nth(8)).toHaveText('2')
  await view.selectOption('issuances')
  const issuedRow = page.getByRole('row').filter({ hasText: issuance.issuanceNumber })
  await expect(issuedRow).toContainText(request.requestNumber)
  await expect(issuedRow.getByRole('cell').nth(9)).toHaveText('2')
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


test('revises a complimentary request to purchase before approving 25 eligible tickets', async ({ page }) => {
  const fixture = await createFixture(25)
  await prisma.inventoryPool.update({ where: { id: fixture.pool.id }, data: { ticketPurpose: 'PURCHASE' } })
  const original = await submitRequest(page, fixture, 2, 'COMPLIMENTARY')
  await page.goto('/approvals')
  await page.getByLabel('Filter approval steps on this page').fill(original.requestNumber)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('Category stock before stand and quota checks: 0 Complimentary / 25 Purchase')).toBeVisible()
  await page.getByRole('button', { name: 'Revise request' }).click()
  const dialog = page.getByRole('dialog', { name: 'Revise requested tickets' })
  const types = dialog.getByRole('group', { name: 'Revised ticket type' })
  await expect(types.getByRole('radio', { name: 'Complimentary' })).toBeChecked()
  const purchase = types.getByRole('radio', { name: 'Purchase' })
  await expect(purchase).toBeVisible()
  await purchase.check()
  await expect(purchase).toBeChecked()
  await dialog.getByRole('spinbutton', { name: 'Suite-5' }).fill('25')
  await dialog.getByLabel(/^Revision reason/).fill('Confirmed purchase quantity')
  await dialog.getByRole('button', { name: 'Save revision' }).click()
  await expect(dialog).toBeHidden()
  const revised = await prisma.request.findUniqueOrThrow({ where: { id: original.id } })
  expect(revised).toMatchObject({ totalRequested: 25, preferredType: 'PURCHASE', totalApproved: 0 })
  await expectBalances(fixture, 25, 0, 0, 0)
  await approve(page, revised)
  await expectBalances(fixture, 0, 25, 0, 0)
  const match = encodeURIComponent(fixture.match.id)
  const [inventory, quotas, reports] = await Promise.all([
    page.request.get(`/api/inventory?matchId=${match}`),
    page.request.get(`/api/quotas?matchId=${match}`),
    page.request.get(`/api/reports?matchId=${match}`),
  ])
  for (const response of [inventory, quotas, reports]) await expect(response).toBeOK()
  expect((await inventory.json()).summary).toMatchObject({ total: 25, available: 0, allocated: 25, issued: 0 })
  expect(await quotas.json()).toMatchObject({
    totals: { allocation: 10, consumed: 0 },
    inventoryByCategory: [{ categoryId: fixture.category.id, purchase: 25, complimentary: 0, unclassified: 0 }],
  })
  expect(await reports.json()).toMatchObject({
    summary: { requested: 25, approved: 25, allocated: 25, issued: 0, available: 0, quotaConsumed: 0 },
    categories: [{ id: fixture.category.id, approved: 25, allocated: 25, issued: 0, available: 0 }],
  })

  await page.goto('/inventory')
  const poolRow = page.getByRole('row').filter({ hasText: fixture.match.title })
  await expect(poolRow.getByText('Purchase', { exact: true })).toBeVisible()
  await expect(poolRow.getByRole('cell')).toHaveText([
    /Suite-5/, /Suite-5/, /Purchase/, /.*/, '25', '0', '25', '0', '0', '0 / 0',
  ])

  await page.goto('/quotas')
  await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(fixture.match.id)
  const purposeRow = page.getByRole('row').filter({ hasText: fixture.match.title })
  await expect(purposeRow.getByRole('cell')).toHaveText([fixture.match.title, 'Suite-5', '0', '25', '0', '0 / 0', '0 / 0'])
  const quotaTotals = page.getByRole('region', { name: 'Quota totals' })
  for (const [label, value] of [['Total allocation', '10'], ['Consumed', '0'], ['Remaining', '10']]) {
    await expect(quotaTotals.getByText(label, { exact: true }).locator('+ p')).toHaveText(value)
  }

  await page.goto('/reports')
  await page.getByRole('combobox', { name: 'Match', exact: true }).selectOption(fixture.match.id)
  const reportRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Suite-5', exact: true }) })
  await expect(reportRow.getByRole('cell')).toHaveText(['Suite-5', '25', '25', '25', '0', '0'])
  await expect(page.getByText('0 of 10 tickets', { exact: true })).toBeVisible()
})


test('Suite-5 purchase inventory supplies the request type through final approval', async ({ page }) => {
  const fixture = await createFixture(25)
  await prisma.inventoryPool.update({ where: { id: fixture.pool.id }, data: { ticketPurpose: 'PURCHASE' } })
  const request = await submitRequest(page, fixture, 25)
  expect(request.preferredType).toBe('PURCHASE')
  await approve(page, request)
  await expectBalances(fixture, 0, 25, 0, 0)
})


test('Mixed inventory keeps purchase and complimentary balances through issuance', async ({ page }) => {
  test.setTimeout(180_000)
  const fixture = await createFixture(10)
  // Independent applicants draw on the same pool and organisation quota.
  const applicant = (label: string, mobileNumber: string) => prisma.requester.create({ data: {
    fullName: label + ' ' + randomUUID(), requesterCategory: 'OTHER',
    mobileNumber, organisationId: fixture.requester.organisationId,
  } })
  const complimentaryApplicant = await applicant('Complimentary applicant', '+919000000002')
  const overflowApplicant = await applicant('Overflow applicant', '+919000000003')
  await prisma.inventoryPool.update({ where: { id: fixture.pool.id }, data: {
    ticketPurpose: 'MIXED', complimentaryQuantity: 4, purchaseQuantity: 6,
  } })
  for (const [type, quantity] of [['PURCHASE', 6], ['COMPLIMENTARY', 3]] as const) {
    const requester = type === 'PURCHASE' ? fixture.requester : complimentaryApplicant
    const request = await submitRequest(page, { ...fixture, requester }, quantity, type)
    const allocation = await approve(page, request)
    await page.goto('/distribution')
    await page.getByRole('button', { name: 'Issue tickets', exact: true }).click()
    const issue = page.getByRole('dialog', { name: 'Issue tickets' })
    await issue.getByLabel('Confirmed allocation item').selectOption(allocation.items[0].id)
    await issue.getByLabel('Quantity').fill('2')
    await issue.getByLabel('Recipient name').fill('Synthetic collector')
    await issue.getByRole('button', { name: 'Issue tickets' }).click()
    await expect(issue).toBeHidden()
  }
  await expectBalances(fixture, 1, 9, 4, 3)
  const expected = { complimentaryAvailable: 1, purchaseAvailable: 0, complimentaryIssued: 2, purchaseIssued: 2 }
  const query = '?matchId=' + fixture.match.id
  const inventory = await page.request.get('/api/inventory' + query)
  const quotas = await page.request.get('/api/quotas' + query)
  const reports = await page.request.get('/api/reports' + query + '&view=pools')
  expect((await inventory.json()).inventory[0].balances).toEqual(expected)
  expect((await quotas.json()).inventoryByCategory[0]).toMatchObject(expected)
  expect((await reports.json()).detail.rows[0].slice(-4)).toEqual([1, 0, 2, 2])
  const overflow = await submitRequest(page, { ...fixture, requester: overflowApplicant }, 1, 'PURCHASE')
  const dialog = await decide(page, overflow.requestNumber, 1)
  await expect(dialog.getByText(/shortage 1/)).toBeVisible()
  await expectBalances(fixture, 1, 9, 4, 3)
})

test('GOD Mode checkbox grants only the selected user full and partial approval without notes', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000)
  const designatedEmail = randomUUID() + '@example.test'
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'BROWSER_TESTER' } })
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'New user' }).click()
  const create = page.getByRole('dialog', { name: 'Create user' })
  await create.getByLabel('Full name').fill('Designated approver')
  await create.getByLabel('Email').fill(designatedEmail)
  await create.getByLabel(/Temporary password/).fill(password)
  await create.getByLabel('Global role').selectOption(role.id)
  const checkbox = create.getByRole('checkbox', { name: /GOD Mode/ })
  await expect(checkbox).not.toBeChecked()
  await checkbox.check()
  await create.getByRole('button', { name: 'Create user' }).click()
  await expect(create).toBeHidden()
  const designated = await prisma.user.findUniqueOrThrow({ where: { email: designatedEmail } })

  const context = await browser.newContext({ baseURL })
  try {
    const approver = await context.newPage()
    await approver.goto('/login')
    await approver.getByLabel('Email').fill(designatedEmail)
    await approver.getByLabel('Password', { exact: true }).fill(password)
    await approver.getByRole('button', { name: 'Sign in' }).click()
    await expect(approver).toHaveURL(/\/dashboard/)
    for (const quantity of [5, 2]) {
      const fixture = await createFixture(10, designated.id)
      const request = await submitRequest(page, fixture, 5)
      await approver.goto('/approvals')
      await approver.getByLabel('Filter approval steps on this page').fill(request.requestNumber)
      if (quantity === 5) {
        await approver.getByRole('button', { name: 'Approve full (5)', exact: true }).click()
      } else {
        await approver.getByRole('button', { name: 'Partial', exact: true }).click()
        const partial = approver.getByRole('dialog', { name: 'Record partial approval' })
        await partial.getByRole('spinbutton', { name: 'Suite-5' }).fill('2')
        await partial.getByRole('button', { name: 'Record partial approval' }).click()
        await expect(partial).toBeHidden()
      }
      await expect.poll(() => prisma.approvalDecision.count({ where: { requestId: request.id, decidedById: designated.id, approvedQty: quantity, remarks: '', confidentialRemarks: null } })).toBe(1)
      await expectBalances(fixture, 10 - quantity, quantity, 0, quantity)
    }

    const fixture = await createFixture()
    const ordinary = await submitRequest(page, fixture, 5)
    await page.goto('/approvals')
    await page.getByLabel('Filter approval steps on this page').fill(ordinary.requestNumber)
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Approve full/ })).toHaveCount(0)
    const step = await prisma.approvalStep.findFirstOrThrow({ where: { requestId: ordinary.id } })
    const item = await prisma.requestItem.findFirstOrThrow({ where: { requestId: ordinary.id } })
    for (const action of ['APPROVE', 'PARTIAL']) {
      const response = await page.request.post('/api/approvals', { data: {
        stepId: step.id, action, requestVersion: ordinary.version,
        items: [{ requestItemId: item.id, approvedQuantity: action === 'PARTIAL' ? 2 : 5 }],
      } })
      expect(response.status()).toBe(400)
    }
    await expectBalances(fixture, 10, 0, 0, 0)
  } finally {
    await context.close()
  }
})
