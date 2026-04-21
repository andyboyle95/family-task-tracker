import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const subscription = await request.json()
  const db = createAdminClient()

  await db.from('push_subscriptions').insert({ user_id: session.userId, subscription })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { endpoint } = await request.json()
  const db = createAdminClient()

  await db
    .from('push_subscriptions')
    .delete()
    .eq('user_id', session.userId)
    .filter('subscription->>endpoint', 'eq', endpoint)

  return NextResponse.json({ success: true })
}
