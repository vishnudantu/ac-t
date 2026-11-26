export interface RequestItemRecord {
  id: string
  requestedQuantity: number
  approvedQuantity: number
  allocatedQuantity?: number
  issuedQuantity?: number
  ticketCategoryId?: string
  ticketCategory?: { id: string; displayName: string }
}

export interface ApprovalStepRecord {
  id: string
  requestId: string
  stepOrder: number
  name: string
  status: string
  deadlineAt: string | null
  createdAt: string
  completedAt: string | null
  assignedRole: { id: string; name: string; displayName: string } | null
  assignedTo: { id: string; fullName: string } | null
  stepDefinition: {
    allowPartialApproval: boolean
    allowReturnForClarification: boolean
  }
  request: {
    id: string
    requestNumber: string
    version: number
    preferredType: string | null
    priority: string
    status: string
    totalRequested: number
    totalApproved: number
    totalAllocated: number
    totalIssued: number
    submittedAt: string | null
    purpose: string | null
    specialInstructions: string | null
    requester: { id: string; fullName: string; mobileNumber: string }
    match: { id: string; title: string; matchDate: string }
    items: RequestItemRecord[]
  }
}

export interface DistributionIssuance {
  id: string
  issuanceNumber: string
  allocationItemId: string
  requestItemId: string
  distributionMethod: string
  quantity: number
  ticketCategory: string
  standName: string
  blockName: string | null
  seatDetails: string | null
  serialNumbers: string[]
  recipientName: string
  recipientMobile: string | null
  status: string
  issuedAt: string
  notes: string | null
}

export interface DistributionBatch {
  id: string
  batchNumber: string
  distributionMethod: 'PHYSICAL' | 'DIGITAL' | 'BOTH'
  status: string
  totalTickets: number
  issuedTickets: number
  deliveredTickets: number
  notes: string | null
  createdAt: string
  match: { id: string; title: string; matchDate: string }
  officer: { id: string; fullName: string } | null
  issuances: DistributionIssuance[]
}

export interface MatchOption {
  id: string
  title: string
  matchDate: string
  status?: string
  tournament?: string | null
  format?: string
  startTime?: string
  venueId?: string
  totalInventory?: number
}

export interface AllocationItemRecord {
  id: string
  quantity: number
  status: string
  standName: string
  blockName: string | null
  ticketCategoryId?: string
  ticketCategory: { id: string; displayName: string }
  requestItem: { requestedQuantity: number; approvedQuantity: number; allocatedQuantity?: number; issuedQuantity?: number }
}

export interface AllocationRecord {
  id: string
  allocationNumber: string
  status: string
  match: { id: string; title: string }
  request: { id: string; requestNumber: string; requester: { fullName: string } }
  items: AllocationItemRecord[]
}

export interface RequestItemMap {
  requestId: string
  items: Array<{ id: string; ticketCategoryId: string; requestedQuantity: number; approvedQuantity: number; allocatedQuantity: number; issuedQuantity: number }>
}

export type RequestItemsByRequest = Record<string, RequestItemMap["items"]>

export interface IssuanceGroup {
  allocation: AllocationRecord
  item: AllocationItemRecord
  requestItemId: string
  remaining: number
}
