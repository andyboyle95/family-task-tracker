import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

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

  // Deduplicate task history → average points per task title
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

  const prompt = `You are a family chore point-award assistant. Parse the user's message into individual tasks and award points.

CALIBRATION: 10 points ≈ 30 minutes of effort.
Built-in reference:
- Baby bottles: 10 pts
- Baby bath: 10 pts
- Cooking dinner: 10 pts
- Cleaning up after dinner: 5 pts
- Vacuuming / hoovering: 10 pts
- Loading dishwasher: 5 pts
- Unloading dishwasher: 5 pts
- Putting bins out: 5 pts
- Laundry (wash + dry): 10 pts
- Ironing: 15 pts
- Full house clean: 30 pts
- Grocery shopping: 15 pts
- Dog walk: 10 pts
- Mowing lawn: 20 pts

FAMILY MEMBERS (map names from input to these IDs):
${membersList}

DEFAULT PERSON if no name is mentioned: id ${session.userId}

TASK HISTORY from this family (use these point values when the task matches):
${taskContext || '(no history yet)'}

USER INPUT:
"${text}"

Rules:
1. Split into individual tasks — one entry per distinct task.
2. If a name is mentioned (e.g. "Andy did the bottles"), assign to that person. Otherwise assign to the default person.
3. Match against task history for point values; if no match, estimate using the calibration.
4. Keep description concise (3–6 words).
5. Return ONLY a JSON array, no prose.

Output format:
[
  {
    "description": "Baby bottles",
    "person_id": "uuid",
    "person_name": "name",
    "points": 10,
    "reasoning": "matches task history at 10 pts"
  }
]`

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set on server' }, { status: 500 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })

    const items = JSON.parse(match[0])
    return NextResponse.json(items)
  } catch (e) {
    console.error('[log-work] AI error:', e)
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
