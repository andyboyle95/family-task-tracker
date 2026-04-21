import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { adjustPoints } from '@/lib/points'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = createAdminClient()

  const { data: task, error: fetchError } = await db
    .from('tasks').select('*').eq('id', id).eq('family_id', session.familyId).single()
  if (fetchError || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') return NextResponse.json({ error: 'Already completed' }, { status: 400 })

  const { error: updateError } = await db.from('tasks').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: session.userId,
  }).eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Award points to assignee (or completer for bounties)
  const awardTo = task.assigned_to ?? session.userId
  await adjustPoints(awardTo, task.point_bounty)

  // Notify task creator if different from completer
  if (task.created_by !== session.userId) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: task.created_by,
          title: 'Task completed!',
          body: `"${task.title}" was completed by ${session.userName} (+${task.point_bounty} pts)`,
          url: '/',
          tag: `complete-${id}`,
        }),
      })
    } catch {}
  }

  // Spawn next recurrence
  if (task.recurrence_rule) {
    try {
      const { RRule } = await import('rrule')
      const rule = RRule.fromString(`DTSTART:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:${task.recurrence_rule}`)
      const next = rule.after(new Date())
      if (next) {
        await db.from('tasks').insert({
          family_id:            task.family_id,
          title:                task.title,
          notes:                task.notes,
          assigned_to:          task.assigned_to,
          created_by:           task.created_by,
          due_at:               next.toISOString(),
          point_bounty:         task.point_bounty,
          recurrence_rule:      task.recurrence_rule,
          recurrence_parent_id: task.recurrence_parent_id ?? task.id,
          is_bounty:            task.is_bounty,
        })
      }
    } catch {}
  }

  return NextResponse.json({ success: true, points_awarded: task.point_bounty })
}
