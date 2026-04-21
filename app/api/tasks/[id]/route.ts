import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()

  const { data, error } = await db
    .from('tasks')
    .update({
      title: body.title,
      notes: body.notes,
      assigned_to: body.is_bounty ? null : (body.assigned_to || null),
      due_at: body.due_at || null,
      point_bounty: body.point_bounty,
      recurrence_rule: body.recurrence_rule || null,
      is_bounty: body.is_bounty ?? false,
    })
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

  const { error } = await db
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('family_id', session.familyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
