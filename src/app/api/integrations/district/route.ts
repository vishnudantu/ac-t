import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getIntegrationConfig, configValue } from '@/lib/integrations'

/**
 * District by Zomato partner webhook scaffold. Provider-agnostic so the same
 * receiver works once District's exact event format is supplied. Expects a
 * shared secret either as a Bearer token or an HMAC-SHA256 signature over the
 * raw body. Dry-run/validate mode is the default so nothing is written until
 * the integration is enabled with DISTRICT_LIVE=true.
 */
const saleItemSchema = z.object({
  matchId: z.string().min(1).max(100),
  ticketCategoryId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(10_000),
  externalOrderId: z.string().min(1).max(200),
  buyerName: z.string().trim().max(200).nullish(),
  buyerMobile: z.string().trim().max(30).nullish(),
}).strict()

const payloadSchema = z.object({
  event: z.enum(['SALE', 'REFUND', 'VALIDATE']).default('SALE'),
  items: z.array(saleItemSchema).min(1).max(500),
}).strict()

async function secretConfigured(): Promise<string | null> {
  const config = await getIntegrationConfig()
  return configValue(config, 'integration.district.webhook_secret', 'DISTRICT_WEBHOOK_SECRET') || null
}

async function verifySignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = await secretConfigured()
  if (!secret) return false
  const bearer = request.headers.get('authorization')
  if (bearer === `Bearer ${secret}`) return true
  const signature = request.headers.get('x-district-signature') || request.headers.get('x-signature')
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = signature.replace(/^sha256=/, '')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  if (!(await secretConfigured())) {
    return NextResponse.json({ error: 'District webhook is not configured' }, { status: 503 })
  }
  if (!(await verifySignature(request, rawBody))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  let payload: z.infer<typeof payloadSchema>
  try {
    payload = payloadSchema.parse(JSON.parse(rawBody))
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const config = await getIntegrationConfig()
  const live = configValue(config, 'integration.district.live', 'DISTRICT_LIVE') === 'true'
  const results: Array<{ ticketCategoryId: string; applied: boolean; remaining: number | null; reason?: string }> = []

  for (const item of payload.items) {
    if (payload.event === 'VALIDATE' || !live) {
      const pool = await prisma.inventoryPool.aggregate({
        where: { matchId: item.matchId, ticketCategoryId: item.ticketCategoryId },
        _sum: { totalQuantity: true, allocatedQuantity: true, issuedQuantity: true, voidQuantity: true },
      })
      const capacity = pool._sum.totalQuantity ?? 0
      const committed = (pool._sum.allocatedQuantity ?? 0) + (pool._sum.issuedQuantity ?? 0) + (pool._sum.voidQuantity ?? 0)
      const remaining = Math.max(0, capacity - committed)
      const delta = payload.event === 'REFUND' ? -item.quantity : item.quantity
      const enough = payload.event === 'REFUND' || remaining >= delta
      results.push({ ticketCategoryId: item.ticketCategoryId, applied: false, remaining, reason: enough ? 'validated' : 'insufficient_availability' })
      continue
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Idempotency on the provider's order id so retries never double-sell.
        const existing = await tx.auditEvent.findFirst({
          where: { entityType: 'DISTRICT_SALE', entityId: item.externalOrderId },
          select: { id: true },
        })
        if (existing) return { ticketCategoryId: item.ticketCategoryId, applied: false, remaining: null, reason: 'duplicate' }

        const pools = await tx.inventoryPool.findMany({
          where: { matchId: item.matchId, ticketCategoryId: item.ticketCategoryId },
          orderBy: { createdAt: 'asc' },
        })
        const delta = payload.event === 'REFUND' ? -item.quantity : item.quantity
        let remainingDelta = delta
        let remaining = 0
        for (const pool of pools) {
          if (payload.event === 'REFUND') {
            const restore = Math.min(pool.issuedQuantity, remainingDelta)
            if (restore > 0) {
              await tx.inventoryPool.update({ where: { id: pool.id }, data: {
                issuedQuantity: { decrement: restore },
                availableQuantity: { increment: restore },
              } })
              remainingDelta -= restore
            }
          } else {
            const available = pool.totalQuantity - pool.allocatedQuantity - pool.issuedQuantity - pool.voidQuantity
            const sell = Math.min(available, remainingDelta)
            if (sell > 0) {
              await tx.inventoryPool.update({ where: { id: pool.id }, data: {
                issuedQuantity: { increment: sell },
                availableQuantity: { decrement: sell },
              } })
              remainingDelta -= sell
            }
          }
        }
        if (remainingDelta > 0) {
          throw new Error(payload.event === 'REFUND' ? 'Refund exceeds issued quantity' : 'Insufficient availability')
        }
        const aggregate = await tx.inventoryPool.aggregate({
          where: { matchId: item.matchId, ticketCategoryId: item.ticketCategoryId },
          _sum: { totalQuantity: true, allocatedQuantity: true, issuedQuantity: true, voidQuantity: true },
        })
        const capacity = aggregate._sum.totalQuantity ?? 0
        const committed = (aggregate._sum.allocatedQuantity ?? 0) + (aggregate._sum.issuedQuantity ?? 0) + (aggregate._sum.voidQuantity ?? 0)
        remaining = Math.max(0, capacity - committed)
        await tx.auditEvent.create({ data: {
          entityType: 'DISTRICT_SALE', entityId: item.externalOrderId, action: payload.event,
          newValues: JSON.stringify({ matchId: item.matchId, ticketCategoryId: item.ticketCategoryId, quantity: delta, buyerName: item.buyerName }),
          changedFields: ['issuedQuantity'],
        } })
        return { ticketCategoryId: item.ticketCategoryId, applied: true, remaining }
      })
      results.push(result)
    } catch (error: unknown) {
      results.push({ ticketCategoryId: item.ticketCategoryId, applied: false, remaining: null, reason: error instanceof Error ? error.message : 'failed' })
    }
  }

  return NextResponse.json({ success: true, live, event: payload.event, results })
}
