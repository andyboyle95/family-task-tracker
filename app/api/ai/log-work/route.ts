import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })
  }

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  const db = createAdminClient()

  const [{ data: members }, { data: history }] = await Promise.all([
    db.from('profiles').select('id, name').eq('family_id', session.familyId),
    db.from('tasks')
      .select('title, point_bounty')
      .eq('family_id', session.familyId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(300),
  ])

  // Deduplicate task history -> average points per task title
  const taskRef = new Map<string, number[]>()
  for (const t of (history ?? [])) {
    const key = t.title.toLowerCase().trim()
    if (!taskRef.has(key)) taskRef.set(key, [])
    taskRef.get(key)!.push(t.point_bounty)
  }
  const taskContext = [...taskRef.entries()]
    .map(([title, pts]) => {
      const avg = Math.round(pts.reduce((a, b) => a + b, 0) / pts.length)
      return `- "${title}": ${avg} pts`
    })
    .slice(0, 40)
    .join('\n')

  const membersList = (members ?? [])
    .map(m => `- ${m.name} (id: ${m.id})`)
    .join('\n')

  const today = new Date().toISOString().split('T')[0]

  const prompt = `You are a family task point-award assistant. Parse the input into individual task completions.

POINT CALIBRATION (10 pts = 30 min):
- 15 min = 5 pts, 30 min = 10 pts, 1 hr = 20 pts, 1.5 hr = 30 pts, 2 hr = 40 pts
- Baby bottles: 10 pts, Baby bath: 10 pts, Cook dinner: 10 pts, Clean up dinner: 5 pts
- Vacuuming: 10 pts, Dishwasher: 5 pts, Bins: 5 pts, Laundry: 10 pts, Ironing: 15 pts
- Full house clean: 30 pts, Grocery shopping: 15 pts, Dog walk: 10 pts, Mow lawn: 20 pts

FAMILY MEMBERS:
${membersList}

DEFAULT PERSON (if no name found): id ${session.userId}

TASK HISTORY (reference point values):
${taskContext || '(none yet)'}

TODAY'S DATE: ${today}

INPUT FORMAT NOTE: Input may be free text OR structured lines like:
  Person Name -- Task description -- Date -- Duration
  Person Name - Task description - Date - Duration
  (separators can be --, -, or the em-dash character)
In structured lines, the FIRST field is always the person's name.
If a duration is given (e.g. "1 hr", "15 min", "2 hours"), use it directly to calculate points.
If a date is given (e.g. "Fri 24 Apr", "24/04", "tomorrow"), parse it to ISO date and include as completed_at.

USER INPUT:
${text}

Rules:
1. One entry per distinct task line/mention.
2. Match person names to the family members list (fuzzy match — "Captain Neen" matches if that name is in the list).
3. If a duration is explicit, use calibration to set points. Otherwise use task history or estimate.
4. Keep description concise (keep the original task description, trim to ~6 words max).
5. Return ONLY a valid JSON array, no other text.

Output format:
[
  {
    "description": "task title",
    "person_id": "uuid from members list",
    "person_name": "their name",
    "points": 10,
    "completed_at": "2025-04-24T12:00:00.000Z",
    "reasoning": "1 hr task = 20 pts"
  }
]
Note: completed_at should be noon on the specified date if a date was given, otherwise omit the field.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) {
      console.error('[log-work] No JSON array in response:', raw)
      return NextResponse.json({ error: 'AI did not return valid JSON' }, { status: 500 })
    }

    const items = JSON.parse(match[0])
    return NextResponse.json(items)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[log-work] error:', msg)
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 })
  }
}
