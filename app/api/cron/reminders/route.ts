import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = await createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000) // next 1 hour

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, assigned_to, point_bounty')
    .eq('status', 'pending')
    .gte('due_at', now.toISOString())
    .lte('due_at', windowEnd.toISOString())
    .not('assigned_to', 'is', null)

  if (!tasks?.length) return NextResponse.json({ reminded: 0 })

  let reminded = 0
  for (const task of tasks) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: task.assigned_to,
          title: 'Task due soon',
          body: `"${task.title}" is due within the hour — ${task.point_bounty} pts`,
          url: '/',
          tag: `reminder-${task.id}`,
        }),
      })
      reminded++
    } catch {}
  }

  return NextResponse.json({ reminded })
}
