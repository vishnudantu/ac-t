import {
  MAX_PAGE_SIZE,
  allocationCreateSchema,
  allocationListQuerySchema,
  assertAllocationRelations,
  assertInventoryRelations,
  assertMatchRelations,
  assertQuotaRelations,
  assertRequestRelations,
  inventoryCreateSchema,
  inventoryListQuerySchema,
  matchCreateSchema,
  matchListQuerySchema,
  paginationQuerySchema,
  quotaCreateSchema,
  quotaListQuerySchema,
  requestCreateSchema,
  requestListQuerySchema,
} from '../src/lib/validation'

describe('API boundary validation', () => {
  it('applies defaults and accepts the maximum page size and zero offset', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 })
    expect(paginationQuerySchema.parse({ limit: '100', offset: '0' })).toEqual({ limit: 100, offset: 0 })
  })

  it.each([
    { limit: '101' },
    { limit: '0' },
    { limit: '-1' },
    { limit: '1.5' },
    { limit: '50 tickets' },
    { limit: '' },
    { offset: '-1' },
    { offset: '2.5' },
    { offset: 'NaN' },
  ])('rejects unsafe pagination: %p', (query) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false)
  })

  it('exposes a stable pagination cap', () => {
    expect(MAX_PAGE_SIZE).toBe(100)
  })

  it('accepts complete match input and converts valid date strings to Date instances', () => {
    const parsed = matchCreateSchema.parse({
      title: '  India vs Australia  ',
      tournament: 'World Cup',
      format: 'ODI',
      matchDate: '2026-11-24T09:30:00.000Z',
      startTime: '14:30',
      venueId: 'venue-1',
      requestOpensAt: null,
      requestClosesAt: '2026-11-23T18:00:00.000Z',
      notes: null,
    })

    expect(parsed.title).toBe('India vs Australia')
    expect(parsed.matchDate).toEqual(new Date('2026-11-24T09:30:00.000Z'))
    expect(parsed.requestClosesAt).toEqual(new Date('2026-11-23T18:00:00.000Z'))
  })

  it.each([
    { matchDate: 'not-a-date' },
    { matchDate: '2026-02-30T09:30:00.000Z' },
    { matchDate: 1732440000000 },
    { format: 'TWENTY20' },
    { status: 'COMPLETED' },
    { matchAdminId: 'attacker-controlled-user' },
    { totalInventory: 9999 },
  ])('rejects invalid or server-owned match fields: %p', (field) => {
    expect(matchCreateSchema.safeParse({
      title: 'India vs Australia', format: 'ODI', matchDate: '2026-11-24T09:30:00.000Z',
      startTime: '14:30', venueId: 'venue-1', ...field,
    }).success).toBe(false)
  })

  it('validates match list statuses, including the all sentinel', () => {
    expect(matchListQuerySchema.parse({ status: 'all' }).status).toBe('all')
    expect(matchListQuerySchema.parse({ status: 'UPCOMING' }).status).toBe('UPCOMING')
    expect(matchListQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success).toBe(false)
  })

  it('validates requests and defaults their only client-settable lifecycle state to DRAFT', () => {
    const parsed = requestCreateSchema.parse({
      matchId: 'match-1', requesterId: 'requester-1', source: 'EMAIL',
      items: [{ ticketCategoryId: 'category-1', requestedQuantity: 2 }],
    })

    expect(parsed.status).toBe('DRAFT')
    expect(parsed.items).toEqual([{ ticketCategoryId: 'category-1', requestedQuantity: 2 }])
  })

  it.each([
    { items: [] },
    { items: [{ ticketCategoryId: 'category-1', requestedQuantity: 0 }] },
    { items: [{ ticketCategoryId: 'category-1', requestedQuantity: -1 }] },
    { items: [{ ticketCategoryId: 'category-1', requestedQuantity: 1.5 }] },
    { items: [{ ticketCategoryId: 'category-1', requestedQuantity: '2' }] },
    { source: 'FAX' },
    { priority: 'URGENT' },
    { status: 'APPROVED' },
    { fulfilmentStatus: 'DELIVERED' },
    { totalRequested: 10000 },
    { createdById: 'another-user' },
  ])('rejects invalid request input: %p', (field) => {
    expect(requestCreateSchema.safeParse({
      matchId: 'match-1', requesterId: 'requester-1', source: 'EMAIL',
      items: [{ ticketCategoryId: 'category-1', requestedQuantity: 2 }], ...field,
    }).success).toBe(false)
  })

  it('supports only allow-listed request filters and bounded search', () => {
    expect(requestListQuerySchema.parse({
      matchId: 'match-1', status: 'APPROVED', requesterId: 'requester-1',
      assignedToId: 'user-1', search: '  Ravi  ',
    })).toEqual({
      matchId: 'match-1', status: 'APPROVED', requesterId: 'requester-1',
      assignedToId: 'user-1', search: 'Ravi', limit: 50, offset: 0,
    })
    expect(requestListQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success).toBe(false)
    expect(requestListQuerySchema.safeParse({ search: 'x'.repeat(201) }).success).toBe(false)
    expect(requestListQuerySchema.safeParse({ unknownFilter: 'ignored' }).success).toBe(false)
  })

  it('accepts a minimal inventory pool and does not trust counter fields', () => {
    expect(inventoryCreateSchema.parse({
      matchId: 'match-1', ticketCategoryId: 'category-1', standName: 'East', totalQuantity: 20,
    })).toEqual({
      matchId: 'match-1', ticketCategoryId: 'category-1', standName: 'East', totalQuantity: 20,
      ticketFormat: 'PHYSICAL', ticketPurpose: 'COMPLIMENTARY', pricingUnit: 'PER_SEAT', complimentaryQuantity: 0, purchaseQuantity: 0, isQuotaPool: false,
    })
  })

  it.each([
    { totalQuantity: 0 },
    { totalQuantity: -2 },
    { totalQuantity: 1.5 },
    { ticketFormat: 'PAPER' },
    { faceValue: '-1' },
    { availableQuantity: 999999 },
    { allocatedQuantity: 999999 },
    { issuedQuantity: 999999 },
    { reservedQuantity: 999999 },
    { isQuotaPool: false, quotaPoolId: 'quota-1' },
    { seatStart: 11, seatEnd: 10 },
  ])('rejects inconsistent inventory input: %p', (field) => {
    expect(inventoryCreateSchema.safeParse({
      matchId: 'match-1', ticketCategoryId: 'category-1', standName: 'East', totalQuantity: 20,
      ...field,
    }).success).toBe(false)
  })

  it('accepts quota-backed inventory and restricts list filters', () => {
    expect(inventoryCreateSchema.parse({
      matchId: 'match-1', ticketCategoryId: 'category-1', standName: 'East', totalQuantity: 20,
      isQuotaPool: true, quotaPoolId: 'quota-1',
    }).quotaPoolId).toBe('quota-1')
    expect(inventoryListQuerySchema.safeParse({ categoryId: 'category-1', limit: '100' }).success).toBe(true)
    expect(inventoryListQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })

  it('validates quotas and their positive category allocations', () => {
    const parsed = quotaCreateSchema.parse({
      matchId: 'match-1', name: 'MEDIA', displayName: 'Media allocation',
      allocations: [{ ticketCategoryId: 'category-1', allocatedQuantity: 10 }],
    })
    expect(parsed.allocations).toEqual([{ ticketCategoryId: 'category-1', allocatedQuantity: 10 }])
  })

  it.each([
    { allocations: [{ ticketCategoryId: 'category-1', allocatedQuantity: 0 }] },
    { allocations: [{ ticketCategoryId: 'category-1', allocatedQuantity: -10 }] },
    { allocations: [
      { ticketCategoryId: 'category-1', allocatedQuantity: 2 },
      { ticketCategoryId: 'category-1', allocatedQuantity: 3 },
    ] },
    { totalAllocation: 50 },
    { consumedQuantity: 1 },
    { status: 'INACTIVE' },
  ])('rejects invalid or server-owned quota input: %p', (field) => {
    expect(quotaCreateSchema.safeParse({
      matchId: 'match-1', name: 'MEDIA', displayName: 'Media allocation', ...field,
    }).success).toBe(false)
  })

  it('validates quota list pagination and match IDs', () => {
    expect(quotaListQuerySchema.safeParse({ matchId: 'match-1' }).success).toBe(true)
    expect(quotaListQuerySchema.safeParse({ matchId: '' }).success).toBe(false)
  })

  it('derives allocation state and total from positive items', () => {
    const parsed = allocationCreateSchema.parse({
      matchId: 'match-1', requestId: 'request-1',
      items: [{ requestItemId: 'request-item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 3, standName: 'East' }],
    })
    expect(parsed.items[0].isFromQuota).toBe(false)
    expect(parsed.items[0].status).toBe('RESERVED')
  })

  it.each([
    { items: [] },
    { items: [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 0, standName: 'East' }] },
    { totalQuantity: 500 },
    { status: 'LOCKED' },
    { officerId: 'another-user' },
    { items: [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 1, standName: 'East', status: 'ISSUED' }] },
    { items: [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 1, standName: 'East', isFromQuota: true }] },
    { items: [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 1, standName: 'East', quotaPoolId: 'quota-1' }] },
  ])('rejects invalid or server-owned allocation input: %p', (field) => {
    expect(allocationCreateSchema.safeParse({ matchId: 'match-1', requestId: 'request-1', ...field,
      items: [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', quantity: 1, standName: 'East' }],
      ...field,
    }).success).toBe(false)
  })

  it('validates allocation list statuses and rejects unknown enum values', () => {
    expect(allocationListQuerySchema.safeParse({ status: 'CONFIRMED' }).success).toBe(true)
    expect(allocationListQuerySchema.safeParse({ status: 'ISSUED' }).success).toBe(false)
  })
})

describe('relation safety checks', () => {
  it('accepts consistent match relations and rejects an invalid venue or administrator', () => {
    expect(assertMatchRelations({ venueExists: true, matchAdminExists: true })).toBeUndefined()
    expect(() => assertMatchRelations({ venueExists: false, matchAdminExists: true })).toThrow('Venue does not exist')
    expect(() => assertMatchRelations({ venueExists: true, matchAdminExists: false })).toThrow('Match administrator does not exist')
  })

  it('accepts matching request categories and rejects cross-match or inactive relations', () => {
    expect(assertRequestRelations({
      matchExists: true, requesterExists: true, assignedToExists: true,
      ticketCategories: [{ id: 'category-1', matchId: 'match-1', isActive: true }],
    }, 'match-1', [{ ticketCategoryId: 'category-1' }])).toBeUndefined()
    expect(() => assertRequestRelations({
      matchExists: false, requesterExists: true, assignedToExists: true, ticketCategories: [],
    }, 'match-1', [])).toThrow('Match does not exist')
    expect(() => assertRequestRelations({
      matchExists: true, requesterExists: true, assignedToExists: true,
      ticketCategories: [{ id: 'category-1', matchId: 'match-2', isActive: true }],
    }, 'match-1', [{ ticketCategoryId: 'category-1' }])).toThrow('Every ticket category must belong to the match and be active')
  })

  it('checks inventory category and optional quota belong to the same match', () => {
    expect(assertInventoryRelations({
      category: { matchId: 'match-1', isActive: true }, quotaPool: { matchId: 'match-1', isActive: true },
    }, 'match-1')).toBeUndefined()
    expect(() => assertInventoryRelations({
      category: { matchId: 'match-2', isActive: true }, quotaPool: null,
    }, 'match-1')).toThrow('Ticket category must belong to the match and be active')
    expect(() => assertInventoryRelations({
      category: { matchId: 'match-1', isActive: true }, quotaPool: { matchId: 'match-2', isActive: true },
    }, 'match-1')).toThrow('Quota pool must belong to the match and be active')
  })

  it('checks quota parent and category relationships', () => {
    expect(assertQuotaRelations({
      matchExists: true, parentQuota: { matchId: 'match-1', isActive: true },
      ticketCategories: [{ id: 'category-1', matchId: 'match-1', isActive: true }],
    }, 'match-1', ['category-1'])).toBeUndefined()
    expect(() => assertQuotaRelations({
      matchExists: true, parentQuota: { matchId: 'match-2', isActive: true }, ticketCategories: [],
    }, 'match-1', [])).toThrow('Parent quota must belong to the match and be active')
    expect(() => assertQuotaRelations({
      matchExists: true, parentQuota: null, ticketCategories: [],
    }, 'match-1', ['category-1'])).toThrow('Every ticket category must belong to the match and be active')
  })

  it('rejects cross-request, cross-match, cross-category, or quota allocation items', () => {
    const relations = {
      request: { matchId: 'match-1' },
      requestItems: [{ id: 'item-1', requestId: 'request-1', ticketCategoryId: 'category-1' }],
      inventoryPools: [{ id: 'pool-1', matchId: 'match-1', ticketCategoryId: 'category-1' }],
      quotaPools: [{ id: 'quota-1', matchId: 'match-1', isActive: true }],
    }
    const items = [{ requestItemId: 'item-1', inventoryPoolId: 'pool-1', ticketCategoryId: 'category-1', isFromQuota: true, quotaPoolId: 'quota-1' }]

    expect(assertAllocationRelations(relations, 'match-1', 'request-1', items)).toBeUndefined()
    expect(() => assertAllocationRelations({ ...relations, request: { matchId: 'match-2' } }, 'match-1', 'request-1', items)).toThrow('Request must belong to the match')
    expect(() => assertAllocationRelations({ ...relations, requestItems: [] }, 'match-1', 'request-1', items)).toThrow('Every request item must belong to the request')
    expect(() => assertAllocationRelations({ ...relations, inventoryPools: [{ id: 'pool-1', matchId: 'match-1', ticketCategoryId: 'category-2' }] }, 'match-1', 'request-1', items)).toThrow('Every inventory pool must belong to the match and item ticket category')
    expect(() => assertAllocationRelations(relations, 'match-1', 'request-1', [{ ...items[0], ticketCategoryId: 'category-2' }])).toThrow('Every item ticket category must match its request item')
    expect(() => assertAllocationRelations({ ...relations, quotaPools: [] }, 'match-1', 'request-1', items)).toThrow('Every quota pool must belong to the match and be active')
  })
})
