import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'
import { getIntegrationConfig, configValue } from '@/lib/integrations'

/** Returns the configured complimentary set-off so forms can prefill it. */
export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, ['inventory:read', 'inventory:write', 'inventory:adjust'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const config = await getIntegrationConfig()
  const setoff = configValue(config, 'pricing.complimentary_setoff_per_ticket') || '499'
  return NextResponse.json({ success: true, complimentarySetoffPerTicket: setoff })
})
