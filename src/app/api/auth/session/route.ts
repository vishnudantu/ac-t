import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<NextResponse> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, {
      status: 401,
      headers: NO_STORE_HEADERS,
    })
  }
  return NextResponse.json(session, { headers: NO_STORE_HEADERS })
}
