import { NextRequest, NextResponse } from 'next/server'
import { COOKIE, ONE_YEAR } from '@/lib/session'

export async function POST(request: NextRequest) {
  const { userId, familyId, userName } = await request.json()
  if (!userId || !familyId || !userName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const res = NextResponse.json({ success: true })
  res.cookies.set(COOKIE, JSON.stringify({ userId, familyId, userName }), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: ONE_YEAR,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.delete(COOKIE)
  return res
}
