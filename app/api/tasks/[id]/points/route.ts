import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const { point_bounty } = await req.json()

  if (typeof point_bounty !== 'number' || point_bounty < 0 || !Number.isInteger(point_bounty)) {
    return NextResponse.json({ error: 'Invalid point_bounty' }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('tasks')
    .update({ point_bounty })
    .eq('id', id)
    .eq('family_id', session.familyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
