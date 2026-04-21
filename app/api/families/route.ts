import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#0284c7','#16a34a','#ea580c',
]

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// POST /api/families — create a new family + first member (admin)
export async function POST(request: NextRequest) {
  const { familyName, yourName } = await request.json()
  if (!familyName?.trim() || !yourName?.trim()) {
    return NextResponse.json({ error: 'Family name and your name are required' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: family, error: famErr } = await db
    .from('families')
    .insert({ name: familyName.trim(), invite_code: randomCode() })
    .select()
    .single()

  if (famErr || !family) {
    console.error('Create family error:', famErr)
    return NextResponse.json({ error: famErr?.message ?? 'Could not create family' }, { status: 500 })
  }

  const { data: profile, error: profErr } = await db
    .from('profiles')
    .insert({ family_id: family.id, name: yourName.trim(), role: 'admin', avatar_color: randomColor() })
    .select()
    .single()

  if (profErr || !profile) {
    return NextResponse.json({ error: profErr?.message ?? 'Could not create profile' }, { status: 500 })
  }

  return NextResponse.json({ family, profile }, { status: 201 })
}
