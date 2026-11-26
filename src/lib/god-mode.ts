import type { Prisma } from '@prisma/client'
import { ApiError } from './api'

type Settings = Pick<Prisma.TransactionClient, 'systemSetting'>
const key = 'approvals.god_mode_user_id'

export async function godModeUser(db: Settings) {
  const setting = await db.systemSetting.findUnique({ where: { key }, select: { value: true } })
  return setting?.value
}

export async function setGodMode(db: Settings, userId: string, enabled: boolean) {
  if (!enabled) {
    await db.systemSetting.deleteMany({ where: { key, value: userId } })
    return
  }
  await db.systemSetting.createMany({
    data: [{ key, value: userId, category: 'APPROVALS', isPublic: false }], skipDuplicates: true,
  })
  if (await godModeUser(db) !== userId) {
    throw new ApiError(409, 'Disable GOD Mode on the current user before enabling it on another account.')
  }
}
