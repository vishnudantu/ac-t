export const purposeAllocations = {
  where: { releasedAt: null, status: { in: ['RESERVED', 'CONFIRMED', 'ISSUED'] } },
  select: {
    quantity: true,
    allocation: { select: { request: { select: { preferredType: true } } } },
    issuances: { where: { status: 'ISSUED' }, select: { quantity: true } },
  },
}

interface PoolBalanceInput {
  ticketPurpose: string
  totalQuantity: number
  availableQuantity: number
  allocatedQuantity: number
  issuedQuantity: number
  complimentaryQuantity: number
  purchaseQuantity: number
  allocations?: {
    quantity: number
    allocation: { request: { preferredType: string | null } }
    issuances: { quantity: number }[]
  }[]
}

export function purposeBalances(p: PoolBalanceInput) {
  const balance = { complimentaryAvailable: 0, purchaseAvailable: 0, complimentaryIssued: 0, purchaseIssued: 0 }
  if (p.ticketPurpose === 'COMPLIMENTARY') return { ...balance, complimentaryAvailable: p.availableQuantity, complimentaryIssued: p.issuedQuantity }
  if (p.ticketPurpose === 'PURCHASE') return { ...balance, purchaseAvailable: p.availableQuantity, purchaseIssued: p.issuedQuantity }
  if (p.ticketPurpose !== 'MIXED') return balance
  let complimentary = 0
  let purchase = 0
  for (const item of p.allocations ?? []) {
    const issued = item.issuances.reduce((sum, row) => sum + row.quantity, 0)
    if (issued > item.quantity) return { ...balance, complimentaryIssued: 0, purchaseIssued: 0 }
    const purpose = item.allocation.request.preferredType
    if (purpose === 'COMPLIMENTARY') {
      complimentary += item.quantity
      balance.complimentaryIssued += issued
    } else if (purpose === 'PURCHASE') {
      purchase += item.quantity
      balance.purchaseIssued += issued
    }
  }
  if (balance.complimentaryIssued + balance.purchaseIssued > p.issuedQuantity) {
    return { complimentaryAvailable: 0, purchaseAvailable: 0, complimentaryIssued: 0, purchaseIssued: 0 }
  }
  // A historical movement without an attributable purpose must not fund a new approval.
  if (p.complimentaryQuantity + p.purchaseQuantity !== p.totalQuantity ||
      complimentary + purchase !== p.allocatedQuantity || complimentary + purchase + p.availableQuantity !== p.totalQuantity ||
      balance.complimentaryIssued + balance.purchaseIssued !== p.issuedQuantity ||
      complimentary > p.complimentaryQuantity || purchase > p.purchaseQuantity) return balance
  balance.complimentaryAvailable = p.complimentaryQuantity - complimentary
  balance.purchaseAvailable = p.purchaseQuantity - purchase
  return balance
}

export function availableForPurpose(pool: PoolBalanceInput, purpose: string) {
  const balances = purposeBalances(pool)
  return purpose === 'PURCHASE' ? balances.purchaseAvailable : purpose === 'COMPLIMENTARY' ? balances.complimentaryAvailable : 0
}
