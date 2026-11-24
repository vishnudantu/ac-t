import { NextRequest, NextResponse } from 'next/server'
import { safeCallbackPath, SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth-core'

const PUBLIC_PAGE_PATHS = new Set(['/login', '/forgot-password', '/health'])

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  if (pathname.startsWith('/api/') || PUBLIC_PAGE_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const claims = token ? await verifySessionToken(token) : null
  if (claims) return NextResponse.next()

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('callbackUrl', safeCallbackPath(`${pathname}${search}`))
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
