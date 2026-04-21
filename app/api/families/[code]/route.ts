import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/families/[code] — look up a family + its members by invite code
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = createAdminClient()

  const { data: family, error } = await db
    .from('families')
    .select('id, name, invite_code')
    .eq('invite_code', code.toUpperCase())
    .single()

  if (error || !family) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }

  const { data: members } = await db
    .from('profiles')
    .select('id, name, avatar_color, role, points')
    .eq('family_id', family.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ family, members: members ?? [] })
}
