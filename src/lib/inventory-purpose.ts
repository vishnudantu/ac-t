interface PoolPurpose {
  ticketPurpose: string
  totalQuantity: number
  complimentaryQuantity: number
  purchaseQuantity: number
}

export function inventoryPurposeTotals(pool: PoolPurpose) {
  const { ticketPurpose, totalQuantity, complimentaryQuantity, purchaseQuantity } = pool
  if (ticketPurpose === 'COMPLIMENTARY') {
    return { complimentary: totalQuantity, purchase: 0, unclassified: 0 }
  }
  if (ticketPurpose === 'PURCHASE') {
    return { complimentary: 0, purchase: totalQuantity, unclassified: 0 }
  }
  if (ticketPurpose === 'MIXED' && complimentaryQuantity >= 0 && purchaseQuantity >= 0
    && complimentaryQuantity + purchaseQuantity <= totalQuantity) {
    return { complimentary: complimentaryQuantity, purchase: purchaseQuantity, unclassified: totalQuantity - complimentaryQuantity - purchaseQuantity }
  }
  return { complimentary: 0, purchase: 0, unclassified: totalQuantity }
}
