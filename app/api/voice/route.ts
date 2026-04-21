import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseNaturalLanguage } from '@/lib/nlp'

// Webhook for Siri Shortcuts and IFTTT voice integrations
// Secured by a per-family webhook token stored in families.invite_code
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, text, assigned_to_name } = body

  if (!token || !text) {
    return NextResponse.json({ error: 'token and text required' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // Look up family by invite_code used as webhook token
  const { data: family } = await supabase
    .from('families')
    .select('id')
    .eq('invite_code', token)
    .single()

  if (!family) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const nlp = await parseNaturalLanguage(text)

  // Try to match assignee name to a family member
  let assigned_to: string | null = null
  const nameHint = assigned_to_name ?? nlp.assignee_name
  if (nameHint) {
    const { data: members } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('family_id', family.id)
    const match = members?.find(m =>
      m.name.toLowerCase().startsWith(nameHint.toLowerCase())
    )
    if (match) assigned_to = match.id
  }

  // Use the first admin as the creator for voice-added tasks
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('family_id', family.id)
    .eq('role', 'admin')
    .limit(1)
    .single()

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      family_id: family.id,
      title: nlp.title || text,
      assigned_to,
      created_by: admin?.id ?? (await supabase.from('profiles').select('id').eq('family_id', family.id).limit(1).single()).data?.id,
      due_at: nlp.due_at,
      point_bounty: nlp.point_bounty ?? 10,
      recurrence_rule: nlp.recurrence_rule,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, task: { id: task.id, title: task.title } })
}
