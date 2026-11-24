import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getSession, hasPermission } from './auth'
import type { SessionPayload } from './auth'

// ---------------------------------------------------------------------------
// Structured API error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------------------
// Error → NextResponse
// ---------------------------------------------------------------------------

interface Logger {
  error(message: string, error: unknown): void
}

const defaultLogger: Logger = {
  error(message: string, error: unknown) {
    // eslint-disable-next-line no-console
    console.error(message, error)
  },
}

export function errorResponse(error: unknown, logger: Logger = defaultLogger): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request data',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
      { status: 400 },
    )
  }

  if (error instanceof ApiError) {
    const body: Record<string, unknown> = { success: false, error: error.message }
    if (error.details !== undefined) body.details = error.details
    return NextResponse.json(body, { status: error.status })
  }

  logger.error('API request failed', error)
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
}

// ---------------------------------------------------------------------------
// JSON body parsing
// ---------------------------------------------------------------------------

export async function parseJsonBody(request: NextRequest): Promise<unknown> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON')
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(400, 'Request body must be a JSON object')
  }
  return raw
}

// ---------------------------------------------------------------------------
// Query-param parsing helper
// ---------------------------------------------------------------------------

export function parseQueryParams(request: NextRequest): Record<string, string> {
  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}

// ---------------------------------------------------------------------------
// Auth + permission wrapper
// ---------------------------------------------------------------------------

type SessionGetter = () => Promise<SessionPayload | null>

export interface WithApiHandlerOptions {
  getSession?: SessionGetter
  logger?: Logger
}

export function withApiHandler<TContext = { params: Promise<Record<string, string | string[]>> }>(
  handler: (request: NextRequest, session: SessionPayload, context?: TContext) => Promise<NextResponse>,
  options: WithApiHandlerOptions = {},
): (request: NextRequest, ...context: [TContext] | []) => Promise<NextResponse> {
  const resolveSession = options.getSession ?? getSession
  const logger = options.logger ?? defaultLogger

  return async (request: NextRequest, ...contextArgs: [TContext] | []): Promise<NextResponse> => {
    const context = contextArgs[0]
    try {
      const session = await resolveSession()
      if (!session) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
      return await handler(request, session, context)
    } catch (error: unknown) {
      return errorResponse(error, logger)
    }
  }
}

export function withPermission<TContext = { params: Promise<Record<string, string | string[]>> }>(
  permission: string,
  handler: (request: NextRequest, session: SessionPayload, context?: TContext) => Promise<NextResponse>,
  sessionGetter?: SessionGetter,
): (request: NextRequest, ...context: [TContext] | []) => Promise<NextResponse> {
  return withApiHandler<TContext>(async (request, session, context) => {
    if (!hasPermission(session.permissions, permission)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    return handler(request, session, context)
  }, { getSession: sessionGetter })
}
