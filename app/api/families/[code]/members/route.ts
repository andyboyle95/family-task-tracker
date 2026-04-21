import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#0284c7','#16a34a','#ea580c',
]

// POST /api/families/[code]/members — add a new member to a family
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = createAdminClient()

  const { data: family } = await db
    .from('families')
    .select('id')
    .eq('invite_code', code.toUpperCase())
    .single()

  if (!family) return NextResponse.json({ error: 'Invalid code' }, { status: 404 })

  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]

  const { data: profile, error } = await db
    .from('profiles')
    .insert({ family_id: family.id, name: name.trim(), avatar_color: color })
    .select()
    .single()

  if (error || !profile) return NextResponse.json({ error: error?.message }, { status: 500 })

  return NextResponse.json(profile, { status: 201 })
}
