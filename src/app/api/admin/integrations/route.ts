import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { getIntegrationConfig, saveIntegrationConfig, INTEGRATION_KEYS } from '@/lib/integrations'

const updateSchema = z.object({ values: z.record(z.string(), z.string().max(500)) }).strict()

const SECRET_KEYS = new Set(['integration.smtp.password', 'integration.twilio.auth_token', 'integration.district.webhook_secret'])

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, ['settings:read', 'settings:write'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const config = await getIntegrationConfig()
  const safe: Record<string, string> = {}
  for (const key of INTEGRATION_KEYS) {
    if (SECRET_KEYS.has(key)) {
      // Mask secrets so the UI can show "configured" without exposing them.
      safe[key] = config[key] ? '••••••••' : ''
    } else {
      safe[key] = config[key] ?? ''
    }
  }
  return NextResponse.json({ success: true, values: safe })
})

export const PATCH = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'settings:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { values } = updateSchema.parse(await request.json())
  // Masked secrets are left unchanged.
  const sanitized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '••••••••' ? '__UNCHANGED__' : value]))
  await saveIntegrationConfig(sanitized)
  return NextResponse.json({ success: true })
})
