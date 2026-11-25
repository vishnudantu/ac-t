import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { sendNotification } from '@/lib/notifications'

const testSchema = z.object({ channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']) }).strict()

/**
 * Sends a delivery-test notification to the signed-in user only. The recipient
 * and body are server-controlled so this endpoint cannot be used to message
 * arbitrary people or inject content.
 */
export const POST = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'notifications:send')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { channel } = testSchema.parse(await request.json())
  await sendNotification({
    recipientId: session.userId,
    channel,
    subject: 'ACA TicketOps delivery test',
    body: `This is a test ${channel.toLowerCase()} notification from ACA TicketOps at ${new Date().toISOString()}.`,
  })
  const log = await prisma.notificationLog.findFirst({
    where: { recipientId: session.userId, channel },
    orderBy: { createdAt: 'desc' },
    select: { status: true, errorMessage: true, sentAt: true },
  })
  return NextResponse.json({ success: true, status: log?.status ?? 'UNKNOWN', errorMessage: log?.errorMessage ?? null, sentAt: log?.sentAt ?? null })
})
