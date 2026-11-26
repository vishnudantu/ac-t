import { z } from "zod"

export const optionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null

export const optionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const namedEntity = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
})

const matchReference = z.object({
  id: z.string(),
  title: z.string(),
})

const nullableDate = z.string().nullable()

export const matchSchema = z.object({
  id: z.string(),
  title: z.string(),
  tournament: z.string().nullable(),
  format: z.string(),
  matchDate: z.string(),
  startTime: z.string(),
  status: z.string(),
  requestOpensAt: nullableDate,
  requestClosesAt: nullableDate,
  totalInventory: z.number(),
  venue: z.object({
    name: z.string(),
    shortName: z.string(),
    city: z.string(),
    state: z.string(),
  }),
  matchAdmin: z.object({ id: z.string(), fullName: z.string(), email: z.string() }).nullable(),
  _count: z.object({
    requests: z.number(),
    ticketCategories: z.number(),
    inventoryPools: z.number(),
  }),
})

export const requestSchema = z.object({
  id: z.string(),
  requestNumber: z.string(),
  priority: z.string(),
  status: z.string(),
  totalRequested: z.number(),
  totalApproved: z.number(),
  totalAllocated: z.number(),
  createdAt: z.string(),
  match: matchReference.extend({ matchDate: z.string() }),
  requester: z.object({
    id: z.string(),
    fullName: z.string(),
    mobileNumber: z.string(),
    email: z.string().nullable(),
    organisation: z.object({ name: z.string() }).nullable(),
  }),
  createdBy: z.object({ id: z.string(), fullName: z.string() }),
  assignedTo: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  items: z.array(z.object({
    id: z.string(),
    requestedQuantity: z.number(),
    approvedQuantity: z.number(),
    ticketCategory: namedEntity,
  })),
  _count: z.object({ attachments: z.number(), comments: z.number(), approvalSteps: z.number() }),
})

export const inventorySchema = z.object({
  id: z.string(),
  standName: z.string(),
  blockName: z.string().nullable(),
  gateName: z.string().nullable(),
  rowStart: z.string().nullable().optional(),
  rowEnd: z.string().nullable().optional(),
  seatStart: z.number().nullable().optional(),
  seatEnd: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  ticketFormat: z.string(),
  ticketPurpose: z.string().optional().default('COMPLIMENTARY'),
  complimentaryQuantity: z.number().optional().default(0),
  purchaseQuantity: z.number().optional().default(0),
  pricingUnit: z.string().optional().default('PER_SEAT'),
  faceValue: z.union([z.string(), z.number()]).nullable(),
  totalQuantity: z.number(),
  reservedQuantity: z.number(),
  availableQuantity: z.number(),
  allocatedQuantity: z.number(),
  issuedQuantity: z.number(),
  returnedQuantity: z.number(),
  voidQuantity: z.number(),
  match: matchReference,
  ticketCategory: namedEntity,
  quotaPool: namedEntity.nullable(),
  _count: z.object({ ticketSerials: z.number(), allocations: z.number() }),
})

export const inventorySummarySchema = z.object({
  total: z.number(),
  reserved: z.number(),
  available: z.number(),
  allocated: z.number(),
  allocatedUnissued: z.number(),
  issued: z.number(),
  returned: z.number(),
  void: z.number(),
})

export const quotaSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  totalAllocation: z.number(),
  consumedQuantity: z.number(),
  isActive: z.boolean(),
  match: matchReference,
  owner: z.object({ id: z.string(), fullName: z.string(), email: z.string() }).nullable(),
  quotaAllocations: z.array(z.object({
    id: z.string(),
    allocatedQuantity: z.number(),
    consumedQuantity: z.number(),
    ticketCategory: namedEntity,
  })),
  childQuotas: z.array(namedEntity),
  _count: z.object({ quotaTransfersFrom: z.number(), quotaTransfersTo: z.number() }),
})

export const allocationSchema = z.object({
  id: z.string(),
  allocationNumber: z.string(),
  status: z.string(),
  totalQuantity: z.number(),
  createdAt: z.string(),
  confirmedAt: nullableDate,
  lockedAt: nullableDate,
  match: matchReference,
  request: z.object({
    requestNumber: z.string(),
    id: z.string(),
    totalIssued: z.number().optional(),
    requester: z.object({ fullName: z.string() }),
  }),
  officer: z.object({ fullName: z.string() }),
  items: z.array(z.object({
    id: z.string(),
    quantity: z.number(),
    standName: z.string(),
    blockName: z.string().nullable(),
    status: z.string(),
    ticketCategory: namedEntity,
    inventoryPool: z.object({ standName: z.string(), blockName: z.string().nullable() }),
    requestItem: z.object({
      requestedQuantity: z.number(),
      approvedQuantity: z.number(),
    }),
  })),
})

export const matchesResponseSchema = z.object({ matches: z.array(matchSchema), total: z.number() })
export const requestsResponseSchema = z.object({ requests: z.array(requestSchema), total: z.number() })
export const inventoryResponseSchema = z.object({
  inventory: z.array(inventorySchema),
  total: z.number(),
  summary: inventorySummarySchema,
})
export const quotasResponseSchema = z.object({ quotas: z.array(quotaSchema), total: z.number() })
export const allocationsResponseSchema = z.object({
  allocations: z.array(allocationSchema),
  total: z.number(),
})

export type Match = z.infer<typeof matchSchema>
export type RequestRecord = z.infer<typeof requestSchema>
export type InventoryPool = z.infer<typeof inventorySchema>
export type InventorySummary = z.infer<typeof inventorySummarySchema>
export type Quota = z.infer<typeof quotaSchema>
export type Allocation = z.infer<typeof allocationSchema>
export type MatchesResponse = z.infer<typeof matchesResponseSchema>
export type RequestsResponse = z.infer<typeof requestsResponseSchema>
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>
export type QuotasResponse = z.infer<typeof quotasResponseSchema>
export type AllocationsResponse = z.infer<typeof allocationsResponseSchema>
