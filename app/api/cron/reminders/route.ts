import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function sendPush(userId: string, title: string, body: string, tag: string) {
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, body, url: '/', tag }),
  })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  let reminded = 0
  let digested = 0

  // ── Hourly: notify for tasks due within the next hour ────────
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)
  const { data: soonTasks } = await db
    .from('tasks')
    .select('id, title, assigned_to, point_bounty')
    .eq('status', 'pending')
    .gte('due_at', now.toISOString())
    .lte('due_at', windowEnd.toISOString())
    .not('assigned_to', 'is', null)

  for (const task of soonTasks ?? []) {
    try {
      await sendPush(
        task.assigned_to!,
        'Task due soon',
        `"${task.title}" is due within the hour — ${task.point_bounty} pts`,
        `reminder-${task.id}`,
      )
      reminded++
    } catch {}
  }

  // ── Daily digest at 7 AM UTC ─────────────────────────────────
  if (now.getUTCHours() === 7) {
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd   = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999)

    const [{ data: todayTasks }, { data: bounties }] = await Promise.all([
      db.from('tasks')
        .select('id, title, assigned_to, point_bounty, family_id')
        .eq('status', 'pending')
        .eq('is_bounty', false)
        .gte('due_at', todayStart.toISOString())
        .lte('due_at', todayEnd.toISOString())
        .not('assigned_to', 'is', null),
      db.from('tasks')
        .select('family_id, point_bounty')
        .eq('status', 'pending')
        .eq('is_bounty', true),
    ])

    // Bounty totals per family
    const bountyCountByFamily = new Map<string, number>()
    const bountyPtsByFamily   = new Map<string, number>()
    for (const b of bounties ?? []) {
      bountyCountByFamily.set(b.family_id, (bountyCountByFamily.get(b.family_id) ?? 0) + 1)
      bountyPtsByFamily.set(b.family_id,   (bountyPtsByFamily.get(b.family_id)   ?? 0) + b.point_bounty)
    }

    // Group assigned tasks by user
    const byUser = new Map<string, { title: string; family_id: string }[]>()
    for (const task of todayTasks ?? []) {
      if (!task.assigned_to) continue
      if (!byUser.has(task.assigned_to)) byUser.set(task.assigned_to, [])
      byUser.get(task.assigned_to)!.push({ title: task.title, family_id: task.family_id })
    }

    for (const [userId, tasks] of byUser) {
      try {
        const listed = tasks.slice(0, 3).map(t => t.title).join(', ')
        const extra  = tasks.length > 3 ? ` +${tasks.length - 3} more` : ''
        const familyId    = tasks[0].family_id
        const bCount = bountyCountByFamily.get(familyId) ?? 0
        const bPts   = bountyPtsByFamily.get(familyId)   ?? 0

        let body = `${tasks.length} task${tasks.length !== 1 ? 's' : ''} due today: ${listed}${extra}`
        if (bCount > 0) body += `. Plus ${bCount} ${bCount === 1 ? 'bounty' : 'bounties'} worth ${bPts} pts up for grabs!`

        await sendPush(userId, "📋 Today's tasks", body, `daily-${now.toISOString().split('T')[0]}`)
        digested++
      } catch {}
    }
  }

  return NextResponse.json({ reminded, digested })
}
