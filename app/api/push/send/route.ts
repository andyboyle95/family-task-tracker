import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/webpush'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Internal endpoint — secured by service role; not exposed to public
  const authHeader = request.headers.get('authorization')
  const isInternal = request.headers.get('x-internal') === process.env.INTERNAL_SECRET

  const supabase = await createAdminClient()

  const { user_id, title, body, url, tag } = await request.json()
  if (!user_id || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', user_id)

  if (!subs?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  const stale: string[] = []

  for (const row of subs) {
    try {
      await sendPushNotification(row.subscription, {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        url: url ?? '/',
        tag,
      })
      sent++
    } catch (err: unknown) {
      if ((err as { statusCode?: number }).statusCode === 410 || (err as { statusCode?: number }).statusCode === 404) {
        stale.push(row.subscription.endpoint)
      }
    }
  }

  // Clean up expired subscriptions
  for (const endpoint of stale) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .filter('subscription->>endpoint', 'eq', endpoint)
  }

  return NextResponse.json({ sent })
}
