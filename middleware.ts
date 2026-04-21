import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE } from '@/lib/session'

export function middleware(request: NextRequest) {
  const session = request.cookies.get(COOKIE)?.value
  const isJoinPage = request.nextUrl.pathname.startsWith('/join')

  if (!session && !isJoinPage) {
    return NextResponse.redirect(new URL('/join', request.url))
  }

  if (session && isJoinPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.*\\.png|sw\\.js|manifest\\.webmanifest|api/).*)'],
}
