import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, errorResponse, parseJsonBody, withApiHandler, withPermission } from '../src/lib/api'
import type { SessionPayload } from '../src/lib/auth'

const session: SessionPayload = {
  userId: 'user-1',
  email: 'operator@example.test',
  fullName: 'Test Operator',
  roles: ['OPERATOR'],
  permissions: ['matches:read'],
}

describe('API response and error handling', () => {
  it('returns a safe structured error with status and details when supplied', async () => {
    const response = errorResponse(new ApiError(422, 'Request is invalid', { field: 'items' }))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Request is invalid',
      details: { field: 'items' },
    })
  })

  it('never leaks unknown internal errors to clients', async () => {
    const logger = { error: jest.fn() }
    const response = errorResponse(new Error('database password leaked'), logger)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
    expect(logger.error).toHaveBeenCalledWith('API request failed', expect.any(Error))
  })

  it('converts Zod errors into a 400 response with field-level details', async () => {
    const result = z.object({ quantity: z.number().int().positive() }).safeParse({ quantity: -1 })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected schema rejection')

    const response = errorResponse(result.error)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid request data',
      details: [{ path: 'quantity', message: expect.any(String) }],
    })
  })
})

describe('JSON body parsing', () => {
  it('returns parsed unknown data for a valid JSON object', async () => {
    const request = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test match' }),
    })
    await expect(parseJsonBody(request)).resolves.toEqual({ title: 'Test match' })
  })

  it('rejects malformed JSON with a controlled 400', async () => {
    const request = new NextRequest('http://localhost/api/matches', { method: 'POST', body: '{invalid' })
    await expect(parseJsonBody(request)).rejects.toMatchObject({ status: 400, message: 'Request body must be valid JSON' })
  })

  it('rejects JSON arrays and primitives as object body boundaries', async () => {
    for (const body of ['[]', 'null', '"text"']) {
      const request = new NextRequest('http://localhost/api/matches', { method: 'POST', body })
      await expect(parseJsonBody(request)).rejects.toMatchObject({ status: 400, message: 'Request body must be a JSON object' })
    }
  })
})

describe('authentication and authorization wrappers', () => {
  it('returns 401 for an unauthenticated request without invoking the handler', async () => {
    const handler = jest.fn()
    const wrapped = withApiHandler(handler, { getSession: async () => null })
    const response = await wrapped(new NextRequest('http://localhost/api/matches'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 403 when the required permission is missing', async () => {
    const handler = jest.fn()
    const unprivileged: SessionPayload = { ...session, permissions: [] }
    const wrapped = withPermission('matches:read', handler, async () => unprivileged)
    const response = await wrapped(new NextRequest('http://localhost/api/matches'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Forbidden' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes the request and session to authorized handlers', async () => {
    const handler = jest.fn(async () => NextResponse.json({ success: true }, { status: 201 }))
    const wrapped = withPermission('matches:read', handler, async () => session)
    const request = new NextRequest('http://localhost/api/matches')

    const response = await wrapped(request)
    expect(response.status).toBe(201)
    expect(handler).toHaveBeenCalledWith(request, session, undefined)
  })

  it('forwards route context without weakening auth', async () => {
    const handler = jest.fn(async (_request, currentSession, context) => NextResponse.json({
      userId: currentSession.userId,
      id: context?.params.id,
    }))
    const wrapped = withPermission<{ params: { id: string } }>('matches:read', handler, async () => session)
    const response = await wrapped(new NextRequest('http://localhost/api/matches/match-1'), { params: { id: 'match-1' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ userId: 'user-1', id: 'match-1' })
  })

  it('handles controlled errors and catches unexpected handler failures', async () => {
    const controlled = withApiHandler(async () => { throw new ApiError(409, 'Duplicate match') }, { getSession: async () => session })
    const response = await controlled(new NextRequest('http://localhost/api/matches'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Duplicate match' })

    const logger = { error: jest.fn() }
    const failed = withApiHandler(async () => { throw new Error('private database details') }, { getSession: async () => session, logger })
    const failureResponse = await failed(new NextRequest('http://localhost/api/matches'))
    expect(failureResponse.status).toBe(500)
    await expect(failureResponse.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
    expect(logger.error).toHaveBeenCalled()
  })
})
