import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const tasks = await request.json()
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: 'Expected a non-empty array of tasks' }, { status: 400 })
  }

  const db = createAdminClient()
  const rows = tasks
    .filter(t => t.title?.trim())
    .map(t => ({
      family_id:       session.familyId,
      title:           t.title.trim(),
      notes:           t.notes || null,
      assigned_to:     t.is_bounty ? null : (t.assigned_to || null),
      created_by:      session.userId,
      due_at:          t.due_at || null,
      point_bounty:    t.point_bounty ?? 10,
      recurrence_rule: t.recurrence_rule || null,
      is_bounty:       t.is_bounty ?? false,
    }))

  if (!rows.length) return NextResponse.json({ error: 'No valid tasks' }, { status: 400 })

  const { data, error } = await db.from('tasks').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
