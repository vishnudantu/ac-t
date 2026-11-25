import { prisma } from '@/lib/prisma'

/**
 * Integration configuration is stored as system settings so it can be edited
 * from the Integrations admin page. Environment variables remain the fallback
 * for production deployments that prefer secrets outside the database.
 */
export const INTEGRATION_KEYS = [
  'integration.smtp.host', 'integration.smtp.port', 'integration.smtp.secure',
  'integration.smtp.user', 'integration.smtp.password', 'integration.smtp.from',
  'integration.email.enabled', 'integration.sms.enabled', 'integration.whatsapp.enabled',
  'integration.twilio.account_sid', 'integration.twilio.auth_token', 'integration.twilio.from',
  'integration.district.webhook_secret', 'integration.district.live',
  'pricing.complimentary_setoff_per_ticket',
] as const

export type IntegrationConfig = Record<string, string>

export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...INTEGRATION_KEYS] } },
    select: { key: true, value: true },
  })
  const config: IntegrationConfig = {}
  for (const setting of settings) config[setting.key] = setting.value
  return config
}

export async function saveIntegrationConfig(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    if (!(INTEGRATION_KEYS as readonly string[]).includes(key)) continue
    // Empty secret fields are left unchanged so the UI can mask them.
    if (value === '__UNCHANGED__') continue
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, category: 'Integrations', description: key },
      update: { value },
    })
  }
}

export function configValue(config: IntegrationConfig, key: string, envFallback?: string): string {
  return config[key] ?? (envFallback ? process.env[envFallback] ?? '' : '')
}
