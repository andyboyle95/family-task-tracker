import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { adjustPoints } from '@/lib/points'

interface LogItem {
  description: string
  person_id: string
  points: number
  completed_at?: string
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { items }: { items: LogItem[] } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 })

  const db = createAdminClient()
  const now = new Date().toISOString()

  for (const item of items) {
    if (!item.description?.trim() || item.points < 1) continue

    await db.from('tasks').insert({
      family_id:    session.familyId,
      title:        item.description.trim(),
      created_by:   session.userId,
      assigned_to:  item.person_id,
      completed_by: item.person_id,
      point_bounty: item.points,
      status:       'completed',
      completed_at: item.completed_at ?? now,
    })

    await adjustPoints(item.person_id, item.points)
  }

  return NextResponse.json({ success: true, count: items.length })
}
