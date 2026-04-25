import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') // YYYY-MM

  const db = createAdminClient()
  let query = db
    .from('tasks')
    .select('id, title, point_bounty, is_bounty, is_shared, completed_at, completed_by, assigned_to, family_id')
    .eq('family_id', session.familyId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1).toISOString()
    const end   = new Date(y, m, 1).toISOString()
    query = query.gte('completed_at', start).lt('completed_at', end)
  } else {
    query = query.limit(100)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
