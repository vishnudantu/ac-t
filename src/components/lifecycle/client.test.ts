import { getAllLifecycleList, getLifecycleList, postLifecycle } from './client'

const fetchMock = jest.fn()
global.fetch = fetchMock

function response(body: object, ok = true): Response {
  return { ok, json: jest.fn().mockResolvedValue(body) } as unknown as Response
}

describe('lifecycle client', () => {
  it('returns real list records and propagates API errors', async () => {
    fetchMock.mockResolvedValueOnce(response({ success: true, steps: [{ id: 'step-1' }], total: 1 }))
    await expect(getLifecycleList('approvals', new AbortController().signal, { limit: 20, offset: 0 })).resolves.toEqual({ items: [{ id: 'step-1' }], total: 1 })
    fetchMock.mockResolvedValueOnce(response({ success: false, error: 'Forbidden' }, false))
    await expect(getLifecycleList('approvals', new AbortController().signal, {})).rejects.toThrow('Forbidden')
  })

  it('loads every page needed for issuance bounds', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ success: true, batches: [{ id: 'batch-1' }], total: 2 }))
      .mockResolvedValueOnce(response({ success: true, batches: [{ id: 'batch-2' }], total: 2 }))
    await expect(getAllLifecycleList('distribution', new AbortController().signal)).resolves.toEqual([{ id: 'batch-1' }, { id: 'batch-2' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('offset=1')
  })

  it('fails instead of returning incomplete data when pagination stalls', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ success: true, batches: [{ id: 'batch-1' }], total: 3 }))
      .mockResolvedValueOnce(response({ success: true, batches: [], total: 3 }))
    await expect(getAllLifecycleList('distribution', new AbortController().signal)).rejects.toThrow(/complete distribution list/i)
  })

  it('serializes writes and surfaces success:false payloads', async () => {
    fetchMock.mockResolvedValueOnce(response({ success: false, error: 'Only draft allocations can be confirmed' }))
    await expect(postLifecycle('/api/allocations/1/confirm', {})).rejects.toThrow(/Only draft allocations/)
    expect(fetchMock).toHaveBeenCalledWith('/api/allocations/1/confirm', expect.objectContaining({ method: 'POST', body: '{}' }))
  })
})
