import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { adjustPoints } from '@/lib/points'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()

  // Build update object from only the fields present in the body to avoid
  // overwriting unrelated columns (e.g. sending { point_bounty } must not
  // reset is_bounty to false or assigned_to to null).
  const updates: Record<string, unknown> = {}
  if ('title'            in body) updates.title            = body.title
  if ('notes'            in body) updates.notes            = body.notes || null
  if ('due_at'           in body) updates.due_at           = body.due_at || null
  if ('point_bounty'     in body) updates.point_bounty     = body.point_bounty
  if ('recurrence_rule'  in body) updates.recurrence_rule  = body.recurrence_rule || null
  if ('is_bounty' in body || 'assigned_to' in body) {
    updates.is_bounty   = body.is_bounty ?? false
    updates.assigned_to = updates.is_bounty ? null : (body.assigned_to || null)
  }

  const { data, error } = await db
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('family_id', session.familyId)
    .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = createAdminClient()

  // Fetch first so we can reverse points if the task was completed
  const { data: task } = await db
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('family_id', session.familyId)
    .single()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('family_id', session.familyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reverse points for whoever completed it
  if (task.status === 'completed') {
    const awardedTo = task.assigned_to ?? task.completed_by
    if (awardedTo) {
      await adjustPoints(awardedTo, -task.point_bounty)
    }
  }

  return NextResponse.json({ success: true })
}
