import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/auth'
import { withApiHandler } from '@/lib/api'

const updateSchema = z.object({ settings: z.array(z.object({
  key: z.enum(['app.name', 'app.organization', 'app.timezone', 'security.session_timeout_hours', 'security.password_min_length']),
  value: z.string().trim().min(1).max(200),
}).strict()).max(10) }).strict()

export const GET = withApiHandler(async (_request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'settings:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const settings = await prisma.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }], take: 200 })
  return NextResponse.json({ success: true, settings })
})

export const PATCH = withApiHandler(async (request: NextRequest, session) => {
  if (!hasPermission(session.permissions, 'settings:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { settings } = updateSchema.parse(await request.json())
  await prisma.$transaction(async (tx) => {
    for (const setting of settings) {
      if (setting.key === 'security.session_timeout_hours' && setting.value !== '24') throw new Error('Session timeout is currently fixed at 24 hours')
      if (setting.key === 'security.password_min_length' && Number(setting.value) < 8) throw new Error('Password minimum length must be at least 8 characters')
      await tx.systemSetting.update({ where: { key: setting.key }, data: { value: setting.value } })
    }
    await tx.auditEvent.create({ data: {
      userId: session.userId, entityType: 'SYSTEM_SETTINGS', entityId: 'general', action: 'UPDATE',
      newValues: JSON.stringify(settings), changedFields: settings.map((setting) => setting.key),
    } })
  })
  return NextResponse.json({ success: true })
})
