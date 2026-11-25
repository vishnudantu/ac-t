import { prisma } from '@/lib/prisma'
import { getIntegrationConfig, configValue } from './integrations'
import { sendSmtpMail } from './smtp'

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP'

export interface NotificationInput {
  recipientId: string
  channel: NotificationChannel
  subject?: string
  body: string
  templateKey?: string
}

async function envEnabled(channel: NotificationChannel): Promise<boolean> {
  const config = await getIntegrationConfig()
  const key = `integration.${channel.toLowerCase()}.enabled`
  const value = configValue(config, key, `ENABLE_${channel}`)
  return value === 'true'
}

/**
 * Dispatch a notification through the configured provider. When the channel is
 * disabled or its provider is unconfigured the attempt is logged as SKIPPED so
 * callers can rely on the log to explain delivery. Provider secrets are never
 * written to the log.
 */
export async function sendNotification(input: NotificationInput): Promise<void> {
  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientId },
    select: { id: true, email: true, mobileNumber: true, isActive: true },
  })
  if (!recipient?.isActive) return

  const template = input.templateKey
    ? await prisma.notificationTemplate.findUnique({ where: { key: input.templateKey }, select: { id: true } })
    : null

  const log = await prisma.notificationLog.create({
    data: {
      recipientId: recipient.id,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      templateId: template?.id,
      status: 'PENDING',
    },
  })

  if (!await envEnabled(input.channel)) {
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', errorMessage: `${input.channel} is disabled by configuration` } })
    return
  }

  try {
    if (input.channel === 'EMAIL') await sendEmail(recipient.email, input.subject || 'Notification', input.body)
    else if (input.channel === 'SMS') await sendSms(recipient.mobileNumber, input.body)
    else if (input.channel === 'WHATSAPP') await sendWhatsApp(recipient.mobileNumber, input.body)
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date() } })
  } catch (error: unknown) {
    await prisma.notificationLog.update({ where: { id: log.id }, data: {
      status: 'FAILED',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed',
    } })
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  await sendSmtpMail({ to, subject, text: body })
}

async function sendSms(to: string | null, body: string): Promise<void> {
  if (!to) throw new Error('Recipient has no mobile number')
  const { accountSid, authToken, from } = await twilioConfig()
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })
  if (!response.ok) throw new Error(`SMS delivery failed (${response.status})`)
}

async function sendWhatsApp(to: string | null, body: string): Promise<void> {
  if (!to) throw new Error('Recipient has no mobile number')
  const { accountSid, authToken, from } = await twilioConfig()
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body }),
  })
  if (!response.ok) throw new Error(`WhatsApp delivery failed (${response.status})`)
}

async function twilioConfig(): Promise<{ accountSid: string; authToken: string; from: string }> {
  const config = await getIntegrationConfig()
  const accountSid = configValue(config, 'integration.twilio.account_sid', 'TWILIO_ACCOUNT_SID')
  const authToken = configValue(config, 'integration.twilio.auth_token', 'TWILIO_AUTH_TOKEN')
  const from = configValue(config, 'integration.twilio.from', 'TWILIO_FROM')
  if (!accountSid || !authToken || !from) throw new Error('Twilio is not configured')
  return { accountSid, authToken, from }
}
