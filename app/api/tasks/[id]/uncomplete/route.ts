import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = createAdminClient()

  const { data: task } = await db
    .from('tasks').select('*').eq('id', id).eq('family_id', session.familyId).single()

  if (!task || task.status !== 'completed') {
    return NextResponse.json({ error: 'Task not found or not completed' }, { status: 404 })
  }

  // Revert status
  await db.from('tasks').update({
    status: 'pending',
    completed_at: null,
    completed_by: null,
  }).eq('id', id)

  // Remove awarded points from whoever received them
  const awardedTo = task.assigned_to ?? task.completed_by
  if (awardedTo) {
    await db.rpc('increment_points', { user_id: awardedTo, amount: -task.point_bounty })
  }

  return NextResponse.json({ success: true })
}
