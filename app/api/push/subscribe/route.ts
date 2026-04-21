import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const subscription = await request.json()

  // Upsert by endpoint to avoid duplicates
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, subscription },
      { onConflict: 'user_id,subscription->>endpoint' }
    )

  if (error) {
    // If upsert fails due to missing unique index, just insert
    await supabase.from('push_subscriptions').insert({ user_id: user.id, subscription })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { endpoint } = await request.json()

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .filter('subscription->>endpoint', 'eq', endpoint)

  return NextResponse.json({ success: true })
}
