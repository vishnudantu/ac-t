import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const MAX_PAGE_SIZE = 100

const id = z.string().trim().min(1, 'ID is required')
const optionalId = id.nullish()
const nonNegativeInt = z.number().int().min(0)
const positiveInt = z.number().int().positive('Quantity must be a positive integer')
const shortText = z.string().trim().min(1).max(500)
const optionalText = z.string().trim().max(2000).nullish()

/** ISO-8601 datetime string converted to Date; rejects calendar-invalid dates. */
export const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Must be a valid ISO-8601 datetime string' })
  .refine((value) => {
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value.slice(0, 10))
  }, 'Invalid calendar date')
  .transform((value) => new Date(value))

const optionalDateTime = isoDateTime.nullish()

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const paginationQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_PAGE_SIZE))
    .default(50),
  offset: z
    .string()
    .regex(/^\d+$/, 'offset must be a non-negative integer')
    .transform(Number)
    .pipe(z.number().int().min(0))
    .default(0),
}).strict()

// ---------------------------------------------------------------------------
// Match enums
// ---------------------------------------------------------------------------

const MATCH_FORMATS = ['TEST', 'ODI', 'T20', 'T20I', 'TOURNAMENT', 'OTHER'] as const
const MATCH_STATUSES = ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const

// ---------------------------------------------------------------------------
// Request enums
// ---------------------------------------------------------------------------

const REQUEST_SOURCES = ['IN_PERSON', 'EMAIL', 'WHATSAPP', 'LETTER', 'PHONE', 'ONLINE_FORM', 'INTERNAL'] as const
const REQUEST_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'PROTOCOL'] as const
const REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'CLOSED'] as const
const REQUEST_CREATE_STATUSES = ['DRAFT', 'SUBMITTED'] as const
const DELIVERY_METHODS = ['PHYSICAL', 'DIGITAL', 'BOTH'] as const

// ---------------------------------------------------------------------------
// Inventory enums
// ---------------------------------------------------------------------------

const TICKET_FORMATS = ['PHYSICAL', 'DIGITAL', 'BOTH'] as const

// ---------------------------------------------------------------------------
// Allocation enums
// ---------------------------------------------------------------------------

const ALLOCATION_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'LOCKED', 'RELEASED'] as const
const ALLOCATION_ITEM_STATUSES = ['RESERVED', 'CONFIRMED', 'RELEASED'] as const

// ===========================================================================
// MATCH
// ===========================================================================

export const matchCreateSchema = z.object({
  title: shortText,
  tournament: optionalText,
  format: z.enum(MATCH_FORMATS),
  matchDate: isoDateTime,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  venueId: id,
  // status, matchAdminId, totalInventory are server-owned — excluded
  requestOpensAt: optionalDateTime,
  requestClosesAt: optionalDateTime,
  approvalDeadline: optionalDateTime,
  allocationDeadline: optionalDateTime,
  distributionDeadline: optionalDateTime,
  notes: optionalText,
  restrictions: optionalText,
  operationalInstructions: optionalText,
}).strict()

export type MatchCreateInput = z.infer<typeof matchCreateSchema>

export const matchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum([...MATCH_STATUSES, 'all']).optional(),
}).strict()

export type MatchListQuery = z.infer<typeof matchListQuerySchema>

// ===========================================================================
// REQUEST
// ===========================================================================

const requestItemSchema = z.object({
  requesterId: optionalId,
  ticketCategoryId: id,
  requestedQuantity: positiveInt,
  preferredStand: optionalText,
  preferredBlock: optionalText,
  priority: nonNegativeInt.optional(),
  notes: optionalText,
}).strict()

export const requestCreateSchema = z.object({
  matchId: id,
  requesterId: id,
  // createdById, totalRequested/Approved/Allocated/Issued/Delivered, fulfilmentStatus are server-owned
  assignedToId: optionalId,
  source: z.enum(REQUEST_SOURCES),
  sourceReference: optionalText,
  priority: z.enum(REQUEST_PRIORITIES).default('NORMAL'),
  protocolClassification: optionalText,
  status: z.enum(REQUEST_CREATE_STATUSES).default('DRAFT'),
  requiredDeliveryMethod: z.enum(DELIVERY_METHODS).nullish(),
  preferredStand: optionalText,
  preferredType: optionalText,
  purpose: optionalText,
  specialInstructions: optionalText,
  internalNotes: optionalText,
  items: z.array(requestItemSchema).min(1, 'At least one item is required'),
}).strict()

export type RequestCreateInput = z.infer<typeof requestCreateSchema>

export const requestListQuerySchema = paginationQuerySchema.extend({
  matchId: id.optional(),
  status: z.enum([...REQUEST_STATUSES, 'all']).optional(),
  requesterId: id.optional(),
  assignedToId: id.optional(),
  search: z.string().trim().max(200).optional(),
}).strict()

export type RequestListQuery = z.infer<typeof requestListQuerySchema>

// ===========================================================================
// INVENTORY
// ===========================================================================

export const inventoryCreateSchema = z.object({
  matchId: id,
  ticketCategoryId: id,
  standName: shortText,
  blockName: optionalText,
  gateName: optionalText,
  rowStart: optionalText,
  rowEnd: optionalText,
  seatStart: nonNegativeInt.nullish(),
  seatEnd: nonNegativeInt.nullish(),
  ticketFormat: z.enum(TICKET_FORMATS).default('PHYSICAL'),
  faceValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'faceValue must be a positive decimal').nullish(),
  pricingCategory: optionalText,
  totalQuantity: positiveInt,
  // reservedQuantity, availableQuantity, allocatedQuantity, issuedQuantity,
  // returnedQuantity, voidQuantity are server-owned counters — excluded
  isQuotaPool: z.boolean().default(false),
  quotaPoolId: optionalId,
  notes: optionalText,
}).strict().refine(
  (data) => {
    if (data.seatStart !== null && data.seatStart !== undefined &&
        data.seatEnd !== null && data.seatEnd !== undefined) {
      return data.seatEnd >= data.seatStart
    }
    return true
  },
  { message: 'seatEnd must be >= seatStart', path: ['seatEnd'] },
).refine(
  (data) => data.isQuotaPool ? !!data.quotaPoolId : !data.quotaPoolId,
  { message: 'quotaPoolId is required when isQuotaPool is true and must be absent otherwise', path: ['quotaPoolId'] },
)

export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>

export const inventoryListQuerySchema = paginationQuerySchema.extend({
  matchId: id.optional(),
  categoryId: id.optional(),
}).strict()

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>

// ===========================================================================
// QUOTA
// ===========================================================================

const quotaAllocationSchema = z.object({
  ticketCategoryId: id,
  allocatedQuantity: positiveInt,
}).strict()

export const quotaCreateSchema = z.object({
  matchId: id,
  name: z.string().trim().min(1).max(100),
  displayName: shortText,
  description: optionalText,
  ownerId: optionalId,
  parentQuotaId: optionalId,
  // totalAllocation, consumedQuantity, isActive are server-owned — excluded
  allocations: z.array(quotaAllocationSchema).optional(),
}).strict().refine(
  (data) => {
    if (!data.allocations) return true
    const ids = data.allocations.map((a) => a.ticketCategoryId)
    return new Set(ids).size === ids.length
  },
  { message: 'Duplicate ticketCategoryId in allocations', path: ['allocations'] },
)

export type QuotaCreateInput = z.infer<typeof quotaCreateSchema>

export const quotaListQuerySchema = paginationQuerySchema.extend({
  matchId: id.optional(),
}).strict()

export type QuotaListQuery = z.infer<typeof quotaListQuerySchema>

// ===========================================================================
// ALLOCATION
// ===========================================================================

const allocationItemSchema = z.object({
  requestItemId: id,
  inventoryPoolId: id,
  ticketCategoryId: id,
  quantity: positiveInt,
  standName: shortText,
  blockName: optionalText,
  seatDetails: optionalText,
  serialRangeStart: optionalText,
  serialRangeEnd: optionalText,
  isFromQuota: z.boolean().default(false),
  quotaPoolId: optionalId,
  status: z.enum(ALLOCATION_ITEM_STATUSES).default('RESERVED'),
}).strict().refine(
  (data) => data.isFromQuota ? !!data.quotaPoolId : !data.quotaPoolId,
  { message: 'quotaPoolId is required when isFromQuota is true and must be absent otherwise', path: ['quotaPoolId'] },
)

export const allocationCreateSchema = z.object({
  matchId: id,
  requestId: id,
  // officerId, status, totalQuantity are server-owned — excluded
  notes: optionalText,
  items: z.array(allocationItemSchema).min(1, 'At least one item is required'),
}).strict()

export type AllocationCreateInput = z.infer<typeof allocationCreateSchema>

export const allocationListQuerySchema = paginationQuerySchema.extend({
  matchId: id.optional(),
  requestId: id.optional(),
  status: z.enum([...ALLOCATION_STATUSES, 'all']).optional(),
}).strict()

export type AllocationListQuery = z.infer<typeof allocationListQuerySchema>

// ===========================================================================
// Relation-safety guards (pure functions — DB fetch happens in the caller)
// ===========================================================================

export interface MatchRelations {
  venueExists: boolean
  matchAdminExists: boolean
}

export function assertMatchRelations(relations: MatchRelations): void {
  if (!relations.venueExists) throw new Error('Venue does not exist')
  if (!relations.matchAdminExists) throw new Error('Match administrator does not exist')
}

export interface TicketCategoryRef {
  id: string
  matchId: string
  isActive: boolean
}

export interface RequestRelations {
  matchExists: boolean
  requesterExists: boolean
  assignedToExists: boolean
  ticketCategories: TicketCategoryRef[]
}

export function assertRequestRelations(
  relations: RequestRelations,
  matchId: string,
  items: Array<{ ticketCategoryId: string }>,
): void {
  if (!relations.matchExists) throw new Error('Match does not exist')
  if (!relations.requesterExists) throw new Error('Requester does not exist')
  if (!relations.assignedToExists) throw new Error('Assigned user does not exist')
  const categoryMap = new Map(relations.ticketCategories.map((c) => [c.id, c]))
  for (const item of items) {
    const cat = categoryMap.get(item.ticketCategoryId)
    if (!cat || cat.matchId !== matchId || !cat.isActive) {
      throw new Error('Every ticket category must belong to the match and be active')
    }
  }
}

export interface InventoryRelations {
  category: { matchId: string; isActive: boolean } | null
  quotaPool: { matchId: string; isActive: boolean } | null
}

export function assertInventoryRelations(relations: InventoryRelations, matchId: string): void {
  if (!relations.category || relations.category.matchId !== matchId || !relations.category.isActive) {
    throw new Error('Ticket category must belong to the match and be active')
  }
  if (relations.quotaPool !== null) {
    if (relations.quotaPool.matchId !== matchId || !relations.quotaPool.isActive) {
      throw new Error('Quota pool must belong to the match and be active')
    }
  }
}

export interface QuotaRelations {
  matchExists: boolean
  parentQuota: { matchId: string; isActive: boolean } | null
  ticketCategories: TicketCategoryRef[]
}

export function assertQuotaRelations(
  relations: QuotaRelations,
  matchId: string,
  allocationCategoryIds: string[],
): void {
  if (!relations.matchExists) throw new Error('Match does not exist')
  if (relations.parentQuota !== null) {
    if (relations.parentQuota.matchId !== matchId || !relations.parentQuota.isActive) {
      throw new Error('Parent quota must belong to the match and be active')
    }
  }
  const categoryMap = new Map(relations.ticketCategories.map((c) => [c.id, c]))
  for (const catId of allocationCategoryIds) {
    const cat = categoryMap.get(catId)
    if (!cat || cat.matchId !== matchId || !cat.isActive) {
      throw new Error('Every ticket category must belong to the match and be active')
    }
  }
}

export interface AllocationRelations {
  request: { matchId: string } | null
  requestItems: Array<{ id: string; requestId: string; ticketCategoryId: string }>
  inventoryPools: Array<{ id: string; matchId: string; ticketCategoryId: string }>
  quotaPools: Array<{ id: string; matchId: string; isActive: boolean }>
}

export function assertAllocationRelations(
  relations: AllocationRelations,
  matchId: string,
  requestId: string,
  items: Array<{
    requestItemId: string
    inventoryPoolId: string
    ticketCategoryId: string
    isFromQuota: boolean
    quotaPoolId?: string | null
  }>,
): void {
  if (!relations.request || relations.request.matchId !== matchId) {
    throw new Error('Request must belong to the match')
  }
  const requestItemMap = new Map(relations.requestItems.map((ri) => [ri.id, ri]))
  const inventoryPoolMap = new Map(relations.inventoryPools.map((ip) => [ip.id, ip]))
  const quotaPoolMap = new Map(relations.quotaPools.map((qp) => [qp.id, qp]))

  for (const item of items) {
    const ri = requestItemMap.get(item.requestItemId)
    if (!ri || ri.requestId !== requestId) {
      throw new Error('Every request item must belong to the request')
    }
    if (ri.ticketCategoryId !== item.ticketCategoryId) {
      throw new Error('Every item ticket category must match its request item')
    }
    const ip = inventoryPoolMap.get(item.inventoryPoolId)
    if (!ip || ip.matchId !== matchId || ip.ticketCategoryId !== item.ticketCategoryId) {
      throw new Error('Every inventory pool must belong to the match and item ticket category')
    }
    if (item.isFromQuota) {
      const qp = item.quotaPoolId ? quotaPoolMap.get(item.quotaPoolId) : undefined
      if (!qp || qp.matchId !== matchId || !qp.isActive) {
        throw new Error('Every quota pool must belong to the match and be active')
      }
    }
  }
}
