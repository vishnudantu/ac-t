export type ApprovalAction = 'APPROVE' | 'PARTIAL' | 'REJECT' | 'RETURN'

export interface ApprovalQuantityItem {
  id: string
  requestedQuantity: number
  approvedQuantity: number
}

export interface IssuedQuantityRecord {
  allocationItemId: string
  quantity: number
  status: string
}

export interface IssuanceRecord extends IssuedQuantityRecord {
  requestItemId: string
}

export interface IssuableItem {
  id: string
  quantity: number
  requestItem: { requestedQuantity: number; approvedQuantity: number; allocatedQuantity?: number }
}

export interface IssueFormValues {
  quantity: number
  recipientName: string
  serialText: string
}

export function approvalDecisionError(
  action: ApprovalAction,
  items: ApprovalQuantityItem[],
  quantities: Record<string, number>,
): string | null {
  if (action === 'REJECT' || action === 'RETURN') return null
  for (const item of items) {
    const quantity = quantities[item.id]
    if (quantity === undefined) return 'Enter a quantity for every request item.'
    if (!Number.isInteger(quantity) || quantity < 0) return 'Approved quantities must be non-negative whole numbers.'
    if (quantity < item.approvedQuantity) return 'Approved quantities cannot reduce previous approvals.'
    if (quantity > item.requestedQuantity) return 'Approved quantity cannot exceed the requested quantity.'
  }
  const requested = items.reduce((sum, item) => sum + item.requestedQuantity, 0)
  const approved = items.reduce((sum, item) => sum + quantities[item.id], 0)
  if (action === 'APPROVE' && approved !== requested) return 'Full approval must approve every requested ticket.'
  if (action === 'PARTIAL' && approved === 0) return 'A partial approval must approve at least one ticket.'
  if (action === 'PARTIAL' && approved === requested) return 'A partial approval must leave at least one ticket unapproved.'
  return null
}

export function getIssuedQuantity(issuances: IssuedQuantityRecord[], allocationItemId: string): number {
  return issuances
    .filter((issuance) => issuance.allocationItemId === allocationItemId && !['CANCELLED', 'RETURNED'].includes(issuance.status))
    .reduce((sum, issuance) => sum + issuance.quantity, 0)
}

export function getRemainingQuantity(
  item: { quantity: number; requestItem: { approvedQuantity: number } },
  issuedQuantity: number,
): number {
  return Math.max(0, Math.min(item.quantity, item.requestItem.approvedQuantity) - issuedQuantity)
}

export function getRequestItemIssued(issuances: IssuanceRecord[], requestItemId: string): number {
  return issuances
    .filter((issuance) => issuance.requestItemId === requestItemId && !['CANCELLED', 'RETURNED'].includes(issuance.status))
    .reduce((sum, issuance) => sum + issuance.quantity, 0)
}

export function parseSerialNumbers(value: string): string[] {
  return value.split(/[\n,]/).map((serial) => serial.trim()).filter(Boolean)
}

export function issueFormError(values: IssueFormValues, remaining: number): string | null {
  if (!Number.isInteger(values.quantity) || values.quantity <= 0) return 'Quantity must be a whole number greater than zero.'
  if (values.quantity > remaining) return `Quantity cannot exceed the ${remaining} remaining tickets.`
  if (!values.recipientName.trim()) return 'Recipient name is required.'
  const serials = parseSerialNumbers(values.serialText)
  if (serials.length > 0 && serials.length !== values.quantity) {
    return `Enter ${values.quantity} serial numbers, or leave serials blank.`
  }
  if (new Set(serials).size !== serials.length) return 'Serial numbers must be unique.'
  return null
}
