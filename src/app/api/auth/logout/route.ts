import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

export async function POST(): Promise<NextResponse> {
  await destroySession()
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
}
