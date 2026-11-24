import {
  approvalDecisionError,
  getIssuedQuantity,
  getRemainingQuantity,
  issueFormError,
  parseSerialNumbers,
} from './rules'

const requestItems = [
  { id: 'request-item-1', requestedQuantity: 10, approvedQuantity: 2 },
  { id: 'request-item-2', requestedQuantity: 5, approvedQuantity: 0 },
]

describe('approvalDecisionError', () => {
  it('requires quantities for every item within previous approval and request bounds', () => {
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 4 })).toMatch(/every request item/i)
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 1, 'request-item-2': 0 })).toMatch(/reduce/i)
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 11, 'request-item-2': 0 })).toMatch(/requested/i)
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 2.5, 'request-item-2': 0 })).toMatch(/whole/i)
  })

  it('distinguishes full approval from a non-empty partial approval', () => {
    expect(approvalDecisionError('APPROVE', requestItems, { 'request-item-1': 9, 'request-item-2': 5 })).toMatch(/full approval/i)
    expect(approvalDecisionError('APPROVE', requestItems, { 'request-item-1': 10, 'request-item-2': 5 })).toBeNull()
    expect(approvalDecisionError('PARTIAL', requestItems.map((item) => ({ ...item, approvedQuantity: 0 })), { 'request-item-1': 0, 'request-item-2': 0 })).toMatch(/at least one/i)
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 10, 'request-item-2': 5 })).toMatch(/leave/i)
    expect(approvalDecisionError('PARTIAL', requestItems, { 'request-item-1': 4, 'request-item-2': 0 })).toBeNull()
  })
})

describe('issuance form rules', () => {
  const issuances = [
    { allocationItemId: 'allocation-item-1', quantity: 3, status: 'ISSUED' },
    { allocationItemId: 'allocation-item-1', quantity: 8, status: 'RETURNED' },
  ]

  it('uses all active nested issuances to calculate the remaining allocation', () => {
    expect(getIssuedQuantity(issuances, 'allocation-item-1')).toBe(3)
    expect(getRemainingQuantity({ quantity: 10, requestItem: { approvedQuantity: 8 } }, 3)).toBe(5)
    expect(getRemainingQuantity({ quantity: 10, requestItem: { approvedQuantity: 20 } }, 3)).toBe(7)
  })

  it('accepts optional serials, otherwise requires one unique serial per issued ticket', () => {
    expect(parseSerialNumbers('')).toEqual([])
    expect(parseSerialNumbers(' A-1\nA-2, A-3 ')).toEqual(['A-1', 'A-2', 'A-3'])
    expect(issueFormError({ quantity: 2, recipientName: 'Recipient', serialText: '' }, 5)).toBeNull()
    expect(issueFormError({ quantity: 2, recipientName: 'Recipient', serialText: 'A-1' }, 5)).toMatch(/2 serial/i)
    expect(issueFormError({ quantity: 2, recipientName: 'Recipient', serialText: 'A-1\nA-1' }, 5)).toMatch(/unique/i)
    expect(issueFormError({ quantity: 2, recipientName: 'Recipient', serialText: 'A-1\nA-2' }, 5)).toBeNull()
  })

  it('rejects missing recipients and quantities outside the remaining bound', () => {
    expect(issueFormError({ quantity: 0, recipientName: 'Recipient', serialText: '' }, 5)).toMatch(/greater than zero/i)
    expect(issueFormError({ quantity: 6, recipientName: 'Recipient', serialText: '' }, 5)).toMatch(/remaining/i)
    expect(issueFormError({ quantity: 2, recipientName: ' ', serialText: '' }, 5)).toMatch(/recipient/i)
  })
})
