import { NextResponse } from 'next/server'
import { pino } from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export function apiError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

export function apiErrorFromUnknown(error: unknown, operation: string): NextResponse {
  logger.error({ err: error, operation }, 'API operation failed')
  return apiError('Internal server error', 500)
}
