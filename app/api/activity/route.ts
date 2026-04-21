import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('tasks')
    .select('id, title, point_bounty, is_bounty, completed_at, completed_by, assigned_to, family_id')
    .eq('family_id', session.familyId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
