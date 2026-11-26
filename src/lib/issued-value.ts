export function purchaseIssueValue(pool: {
  pricingUnit: string
  issuedQuantity: number
  totalQuantity: number
  faceValue: unknown
}): number | null {
  if (!pool.issuedQuantity) return 0
  if (pool.faceValue == null) return null
  if (pool.pricingUnit === 'PER_SUITE') {
    return pool.issuedQuantity === pool.totalQuantity ? Number(pool.faceValue) : null
  }
  return Number(pool.faceValue) * pool.issuedQuantity
}
