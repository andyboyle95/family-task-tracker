import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'all'
  const db = createAdminClient()

  let query = db
    .from('tasks')
    .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color), creator:profiles!tasks_created_by_fkey(id,name)`)
    .eq('family_id', session.familyId)
    .neq('status', 'cancelled')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filter === 'mine') query = query.eq('assigned_to', session.userId)
  if (filter === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setHours(23, 59, 59, 999)
    query = query.gte('due_at', start.toISOString()).lte('due_at', end.toISOString())
  }
  if (filter === 'upcoming') {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0)
    query = query.gte('due_at', tomorrow.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json()
  const { title, notes, assigned_to, due_at, point_bounty, recurrence_rule, is_bounty } = body
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const db = createAdminClient()
  const { data: task, error } = await db
    .from('tasks')
    .insert({
      family_id: session.familyId,
      title: title.trim(),
      notes: notes || null,
      assigned_to: is_bounty ? null : (assigned_to || null),
      created_by: session.userId,
      due_at: due_at || null,
      point_bounty: point_bounty ?? 10,
      recurrence_rule: recurrence_rule || null,
      is_bounty: is_bounty ?? false,
    })
    .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (assigned_to && assigned_to !== session.userId) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: assigned_to,
          title: 'New task assigned to you',
          body: `${title} — ${point_bounty ?? 10} pts`,
          url: '/',
          tag: `task-${task.id}`,
        }),
      })
    } catch {}
  }

  return NextResponse.json(task, { status: 201 })
}
