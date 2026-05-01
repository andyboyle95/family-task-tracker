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
  if (hrMatch)  return Math.round(parseFloat(hrMatch[1]) * 20)
  if (minMatch) return Math.round(parseInt(minMatch[1]) / 30 * 10)
  return null
}

/* ── Date string → ISO (noon on that day) ──────────────────────────────── */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${s}T12:00:00.000Z`
  const numeric = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/)
  if (numeric) {
    const year = numeric[3]
      ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : new Date().getFullYear().toString()
    return `${year}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}T12:00:00.000Z`
  }
  const months: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  }
  const named = s.match(/(?:\w+\s+)?(\d{1,2})\s+([a-z]{3})/i)
    ?? s.match(/([a-z]{3})\s+(\d{1,2})/i)
  if (named) {
    let day: string, mon: string
    if (/\d/.test(named[1])) { day = named[1]; mon = named[2] }
    else                     { mon = named[1]; day = named[2] }
    const m = months[mon.toLowerCase().slice(0,3)]
    if (m) return `${new Date().getFullYear()}-${m}-${day.padStart(2,'0')}T12:00:00.000Z`
  }
  return null
}

/* ── Fuzzy name → member match ──────────────────────────────────────────── */
function matchMember(name: string, members: { id: string; name: string }[]) {
  const n = name.toLowerCase().trim()
  return (
    members.find(m => m.name.toLowerCase() === n) ??
    members.find(m => m.name.toLowerCase().startsWith(n) || n.startsWith(m.name.toLowerCase())) ??
    members.find(m => n.split(/\s+/).some(w => w.length > 2 && m.name.toLowerCase().includes(w))) ??
    null
  )
}

/* ── Try to parse "Person — Task — Date — Duration" ────────────────────── */
function tryParseStructured(line: string, members: { id: string; name: string }[]) {
  const parts = line.split(/\s*(?:—|--|–|-(?=\s))\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const person = matchMember(parts[0], members)
  if (!person) return null
  let points: number | null = null
  let completed_at: string | null = null
  for (let i = 2; i < parts.length; i++) {
    if (points === null) { const p = durationToPoints(parts[i]); if (p !== null) { points = p; continue } }
    if (completed_at === null) { const d = parseDate(parts[i]); if (d !== null) { completed_at = d; continue } }
  }
  return { description: parts[1], person_id: person.id, person_name: person.name, points, completed_at }
}

/* ── Keyword-based point estimate calibrated to 20pts/hr ───────────────── */
function estimatePoints(desc: string): number {
  const d = desc.toLowerCase()
  // ~2hr = 40pts
  if (/full.*(clean|house|spring)/.test(d))              return 40
  // ~1.5hr = 30pts
  if (/mow|lawn/.test(d))                                return 30
  // ~1hr = 20pts
  if (/iron|grocery|big.?shop|supermarket|garden(?!.*water)/.test(d)) return 20
  // ~45min = 15pts
  if (/declutter|sort.*out|clear.*out|organis/.test(d))  return 15
  // ~30min = 10pts
  if (/cook|dinner|lunch|breakfast|make.*meal|supper/.test(d)) return 10
  if (/vacuum|hoover|sweep/.test(d))                     return 10
  if (/laundry|washing(?!.*up)|clothes/.test(d))         return 10
  if (/clean(?!.*up)|mop|scrub/.test(d))                 return 10
  if (/bath|walk.*dog|dog.*walk/.test(d))                return 10
  if (/shop(?!.*dish)|order|pick.?up/.test(d))           return 10
  // ~15min = 5pts
  if (/dishwasher|washing.?up|tidy|clear.?up|wipe/.test(d)) return 5
  if (/bottle|nappy|nappie|bin|trash|rubbish/.test(d))   return 5
  return 10
}

/* ── Main handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
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

    const memberList = (members ?? []) as { id: string; name: string }[]
    const defaultMember = memberList.find(m => m.id === session.userId)
      ?? { id: session.userId, name: 'You' }

    // Build task history map
    const taskRef = new Map<string, number[]>()
    for (const t of (history ?? [])) {
      const key = t.title.toLowerCase().trim()
      if (!taskRef.has(key)) taskRef.set(key, [])
      taskRef.get(key)!.push(t.point_bounty)
    }
    function historyPoints(desc: string): number | null {
      const key = desc.toLowerCase().trim()
      const exact = taskRef.get(key)
      if (exact) return Math.round(exact.reduce((a,b) => a+b,0) / exact.length)
      const words = key.split(/\s+/).slice(0,4).join(' ')
      const partial = [...taskRef.keys()].find(k =>
        k.startsWith(words) || words.startsWith(k.split(/\s+/).slice(0,4).join(' '))
      )
      if (partial) {
        const h = taskRef.get(partial)!
        return Math.round(h.reduce((a,b) => a+b,0) / h.length)
      }
      return null
    }

    // ── Phase 1: deterministically parse structured lines ──
    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const structuredItems: {
      description: string; person_id: string; person_name: string
      points: number; completed_at?: string; reasoning: string
    }[] = []
    const freeTextLines: string[] = []

    for (const line of lines) {
      const s = tryParseStructured(line, memberList)
      if (s) {
        const pts = s.points
          ?? historyPoints(s.description)
          ?? estimatePoints(s.description)
        const reasoning = s.points
          ? `Duration → ${pts} pts`
          : historyPoints(s.description)
            ? `Matched history at ${pts} pts`
            : `Estimated — adjust if needed`
        structuredItems.push({
          description:  s.description,
          person_id:    s.person_id,
          person_name:  s.person_name,
          points:       pts,
          completed_at: s.completed_at ?? undefined,
          reasoning,
        })
      } else {
        freeTextLines.push(line)
      }
    }

    // ── Phase 2: AI for free-text lines only ──
    let aiItems: typeof structuredItems = []

    if (freeTextLines.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const taskContext = [...taskRef.entries()]
        .slice(0, 40)
        .map(([title, pts]) => `- "${title}": ${Math.round(pts.reduce((a,b)=>a+b,0)/pts.length)} pts`)
        .join('\n')

      const prompt = `Parse household tasks and return JSON. Use this EXACT point scale (20pts = 1hr):
10min→3pts | 15min→5pts | 30min→10pts | 45min→15pts | 1hr→20pts | 1.5hr→30pts | 2hr→40pts

COMMON DURATIONS: bin/bottles/nappy/tidy→5pts | dishwasher/washing-up/clear-up→5pts | cooking/cleaning/hoovering/laundry/bath/dog walk→10pts | ironing/grocery shop→20pts | mowing/full house clean→30-40pts

FAMILY: ${memberList.map(m => `${m.name}(${m.id})`).join(', ')}
DEFAULT PERSON: ${session.userId}
TASK HISTORY (use as reference): ${taskContext || 'none'}
TODAY: ${new Date().toISOString().split('T')[0]}

TASKS TO PARSE:
${freeTextLines.join('\n')}

Return ONLY a JSON array:
[{"description":"short title","person_id":"uuid","person_name":"name","points":10,"completed_at":null,"reasoning":"e.g. cooking ~30min → 10pts"}]`

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const resp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }],
        })
        const raw = resp.content[0].type === 'text' ? resp.content[0].text : ''
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) aiItems = JSON.parse(match[0])
      } catch (e) {
        console.error('[log-work] AI call failed:', e)
      }
    }

    // Fallback for free-text lines if AI unavailable or failed
    if (freeTextLines.length > 0 && aiItems.length === 0) {
      aiItems = freeTextLines.map(line => {
        const pts = historyPoints(line) ?? estimatePoints(line)
        return {
          description:  line.slice(0, 80),
          person_id:    defaultMember.id,
          person_name:  defaultMember.name,
          points:       pts,
          reasoning:    process.env.ANTHROPIC_API_KEY
            ? 'AI unavailable — keyword estimate'
            : `Keyword estimate (set ANTHROPIC_API_KEY for AI)`,
        }
      })
    }

    return NextResponse.json([...structuredItems, ...aiItems])

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[log-work] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
