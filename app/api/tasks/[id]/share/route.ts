import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { adjustPoints } from '@/lib/points'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = createAdminClient()

  const { data: task } = await db
    .from('tasks').select('*').eq('id', id).eq('family_id', session.familyId).single()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.status !== 'completed') return NextResponse.json({ error: 'Task not completed' }, { status: 400 })
  if (task.is_shared) return NextResponse.json({ error: 'Already shared' }, { status: 400 })

  // Remove the half that shouldn't have been awarded (floor keeps the recipient's half)
  const halfToRemove = Math.floor(task.point_bounty / 2)
  const awardedTo = task.assigned_to ?? task.completed_by
  if (!awardedTo) return NextResponse.json({ error: 'No recipient found' }, { status: 400 })

  await Promise.all([
    db.from('tasks').update({ is_shared: true }).eq('id', id),
    adjustPoints(awardedTo, -halfToRemove),
  ])

  return NextResponse.json({ success: true, points_removed: halfToRemove })
}
