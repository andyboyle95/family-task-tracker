import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

/* ── Duration string → points ───────────────────────────────────────────── */
function durationToPoints(dur: string): number | null {
  const s = dur.toLowerCase().trim()
  const hrMatch  = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/)
  const minMatch = s.match(/(\d+)\s*(?:min|minute)/)
  if (hrMatch)  return Math.round(parseFloat(hrMatch[1])  * 20)
  if (minMatch) return Math.round(parseInt(minMatch[1])   / 30 * 10)
  return null
}

/* ── Date string → ISO (noon on that day) ──────────────────────────────── */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // ISO or numeric: 2025-04-24 or 24/04/25 etc.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${s}T12:00:00.000Z`

  const numeric = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/)
  if (numeric) {
    const year = numeric[3]
      ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : new Date().getFullYear().toString()
    const m = numeric[2].padStart(2, '0')
    const d = numeric[1].padStart(2, '0')
    return `${year}-${m}-${d}T12:00:00.000Z`
  }

  // Weekday + day + month: "Fri 24 Apr", "24 Apr", "Apr 24"
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  }
  const named = s.match(/(?:\w+\s+)?(\d{1,2})\s+([a-z]{3})/i)
    ?? s.match(/([a-z]{3})\s+(\d{1,2})/i)
  if (named) {
    let day: string, mon: string
    if (/\d/.test(named[1])) { day = named[1]; mon = named[2] }
    else                     { mon = named[1]; day = named[2] }
    const m = months[mon.toLowerCase().slice(0, 3)]
    if (m) {
      const year = new Date().getFullYear()
      return `${year}-${m}-${day.padStart(2, '0')}T12:00:00.000Z`
    }
  }

  return null
}

/* ── Fuzzy name → member match ──────────────────────────────────────────── */
function matchMember(name: string, members: { id: string; name: string }[]) {
  const n = name.toLowerCase().trim()
  // exact
  let m = members.find(m => m.name.toLowerCase() === n)
  if (m) return m
  // member name starts with input or input starts with member name
  m = members.find(m =>
    m.name.toLowerCase().startsWith(n) || n.startsWith(m.name.toLowerCase())
  )
  if (m) return m
  // any word overlap
  const words = n.split(/\s+/)
  m = members.find(m =>
    words.some(w => w.length > 2 && m.name.toLowerCase().includes(w))
  )
  return m ?? null
}

/* ── Structured line parser ─────────────────────────────────────────────── */
function tryParseStructured(
  line: string,
  members: { id: string; name: string }[],
  defaultUserId: string,
): { description: string; person_id: string; person_name: string; points: number | null; completed_at: string | null } | null {
  // Split on em-dash, double-dash, or spaced single dash
  const parts = line.split(/\s*(?:—|--|–|-(?=\s))\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null

  // First field: try to match as a person name
  const personMatch = matchMember(parts[0], members)
  if (!personMatch) return null  // first field isn't a known person → not structured

  let description = parts[1] ?? ''
  let points: number | null = null
  let completed_at: string | null = null

  // Scan remaining fields for duration and date
  for (let i = 2; i < parts.length; i++) {
    const p = parts[i]
    if (points === null) {
      const pts = durationToPoints(p)
      if (pts !== null) { points = pts; continue }
    }
    if (completed_at === null) {
      const dt = parseDate(p)
      if (dt !== null) { completed_at = dt; continue }
    }
  }

  return {
    description,
    person_id:   personMatch.id,
    person_name: personMatch.name,
    points,
    completed_at,
  }
}

/* ── Main handler ───────────────────────────────────────────────────────── */
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

  const memberList = (members ?? []) as { id: string; name: string }[]

  // Deduplicate task history for AI context
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

  // ── Phase 1: deterministically parse structured lines ──
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
  const structured: {
    description: string; person_id: string; person_name: string
    points: number | null; completed_at: string | null; line: string
  }[] = []
  const freeTextLines: string[] = []

  for (const line of lines) {
    const parsed = tryParseStructured(line, memberList, session.userId)
    if (parsed) {
      structured.push({ ...parsed, line })
    } else {
      freeTextLines.push(line)
    }
  }

  // Items with known duration don't need AI; others do
  const needsAI = structured.filter(s => s.points === null)
  const ready   = structured.filter(s => s.points !== null)

  // ── Phase 2: call AI only for tasks that need point estimation ──
  let aiItems: {
    description: string; person_id: string; person_name: string
    points: number; completed_at?: string; reasoning: string
  }[] = []

  const aiInputLines = [
    ...needsAI.map(s => s.line),
    ...freeTextLines,
  ]

  if (aiInputLines.length > 0) {
    const membersList = memberList.map(m => `- ${m.name} (id: ${m.id})`).join('\n')
    const today = new Date().toISOString().split('T')[0]

    const prompt = `Parse these task entries and return points for each.

CALIBRATION: 10 pts = 30 min. 15 min=5pts, 30 min=10pts, 1hr=20pts, 2hr=40pts.

FAMILY MEMBERS:
${membersList}
DEFAULT PERSON id: ${session.userId}

TASK HISTORY:
${taskContext || '(none)'}

TODAY: ${today}

INPUT (one task per line):
${aiInputLines.join('\n')}

Return ONLY a JSON array with one object per input line, in order:
[{"description":"short title","person_id":"uuid","person_name":"name","points":10,"completed_at":"ISO or null","reasoning":"why these points"}]`

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        // Override person_id for structured lines where we already resolved the person
        aiItems = parsed.map((item: typeof aiItems[0], idx: number) => {
          const src = needsAI[idx]
          if (src) {
            return {
              ...item,
              person_id:   src.person_id,
              person_name: src.person_name,
              completed_at: item.completed_at ?? src.completed_at ?? undefined,
            }
          }
          return item
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[log-work] AI error:', msg)
      // Don't 500 — return whatever we already parsed deterministically
    }
  }

  // ── Merge results in original order ──
  const result = [
    ...ready.map(s => ({
      description:  s.description,
      person_id:    s.person_id,
      person_name:  s.person_name,
      points:       s.points!,
      completed_at: s.completed_at ?? undefined,
      reasoning:    `Duration → ${s.points} pts`,
    })),
    ...aiItems,
  ]

  return NextResponse.json(result)
}
