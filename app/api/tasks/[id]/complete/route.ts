import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Fetch task to get bounty and assignee
  const { data: task, error: fetchError } = await supabase
    .from('tasks').select('*').eq('id', id).single()
  if (fetchError || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'completed') return NextResponse.json({ error: 'Already completed' }, { status: 400 })

  // Mark complete
  const { error: updateError } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: user.id })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Award points to assignee (or completer if no assignee)
  const awardTo = task.assigned_to ?? user.id
  await supabase.rpc('increment_points', { user_id: awardTo, amount: task.point_bounty })

  // Notify task creator if different from completer
  if (task.created_by !== user.id) {
    const { data: completerProfile } = await supabase
      .from('profiles').select('name').eq('id', user.id).single()
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: task.created_by,
          title: 'Task completed!',
          body: `"${task.title}" was completed by ${completerProfile?.name ?? 'someone'} (+${task.point_bounty} pts)`,
          url: '/',
          tag: `complete-${id}`,
        }),
      })
    } catch {}
  }

  // Spawn next recurrence if applicable
  if (task.recurrence_rule) {
    try {
      const { RRule } = await import('rrule')
      const rule = RRule.fromString(`DTSTART:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:${task.recurrence_rule}`)
      const next = rule.after(new Date())
      if (next) {
        await supabase.from('tasks').insert({
          family_id: task.family_id,
          title: task.title,
          notes: task.notes,
          assigned_to: task.assigned_to,
          created_by: task.created_by,
          due_at: next.toISOString(),
          point_bounty: task.point_bounty,
          recurrence_rule: task.recurrence_rule,
          recurrence_parent_id: task.recurrence_parent_id ?? task.id,
        })
      }
    } catch {}
  }

  return NextResponse.json({ success: true, points_awarded: task.point_bounty })
}
