import { godModeUser, setGodMode } from '@/lib/god-mode'

it('grants one account and requires revocation before granting another', async () => {
  let owner: string | undefined
  const db = { systemSetting: {
    findUnique: async () => owner ? { value: owner } : null,
    createMany: async ({ data }: { data: { value: string }[] }) => { owner ??= data[0].value },
    deleteMany: async ({ where }: { where: { value: string } }) => { if (where.value === owner) owner = undefined },
  } } as unknown as Parameters<typeof setGodMode>[0]
  expect(await godModeUser(db)).toBeUndefined()
  await setGodMode(db, 'a', true)
  await setGodMode(db, 'b', false)
  await expect(setGodMode(db, 'b', true)).rejects.toThrow(/Disable GOD Mode/)
  expect(await godModeUser(db)).toBe('a')
  await setGodMode(db, 'a', false)
  await setGodMode(db, 'b', true)
  expect(await godModeUser(db)).toBe('b')
})
