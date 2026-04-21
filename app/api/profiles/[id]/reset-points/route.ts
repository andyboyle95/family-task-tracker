import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = createAdminClient()

  // Ensure target profile belongs to the same family
  const { data: profile } = await db
    .from('profiles')
    .select('family_id')
    .eq('id', id)
    .single()

  if (!profile || profile.family_id !== session.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await db.from('profiles').update({ points: 0 }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
