import * as chrono from 'chrono-node'
import type { NLPResult } from '@/types'

const RRULE_MAP: [RegExp, string][] = [
  [/every\s+day|daily/i,             'FREQ=DAILY'],
  [/every\s+week(?!day)|weekly/i,    'FREQ=WEEKLY'],
  [/every\s+month|monthly/i,         'FREQ=MONTHLY'],
  [/every\s+mon(day)?/i,             'FREQ=WEEKLY;BYDAY=MO'],
  [/every\s+tue(sday)?/i,            'FREQ=WEEKLY;BYDAY=TU'],
  [/every\s+wed(nesday)?/i,          'FREQ=WEEKLY;BYDAY=WE'],
  [/every\s+thu(rsday)?/i,           'FREQ=WEEKLY;BYDAY=TH'],
  [/every\s+fri(day)?/i,             'FREQ=WEEKLY;BYDAY=FR'],
  [/every\s+sat(urday)?/i,           'FREQ=WEEKLY;BYDAY=SA'],
  [/every\s+sun(day)?/i,             'FREQ=WEEKLY;BYDAY=SU'],
  [/every\s+2\s+weeks|fortnightly/i, 'FREQ=WEEKLY;INTERVAL=2'],
]

function quickRecurrence(text: string): string | null {
  for (const [re, rule] of RRULE_MAP) if (re.test(text)) return rule
  return null
}

function extractPoints(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:pts?|points?)/i)
  return m ? parseInt(m[1]) : null
}

function detectBounty(text: string): boolean {
  // Matches explicit "bounty"/"bounties" keyword, or phrases meaning "anyone can do it"
  return /\bbount(?:y|ies)\b|\banyone\b|\bwhoever\b|up\s+for\s+grabs|anyone\s+can|family\s+can\s+(?:do|grab|claim)|open\s+task/i.test(text)
}

function extractAssigneeName(text: string): string | null {
  const m = text.match(/(?:remind|assign(?:ed)?\s+to|for)\s+([A-Z][a-z]+)/i)
  return m ? m[1] : null
}

function buildTitle(text: string): string {
  let t = text
  // Strip meta-phrases and bounty-specific words
  t = t.replace(/make\s+(?:a\s+)?(?:daily\s+|weekly\s+|monthly\s+)?(?:task|bounty|chore|reminder)\s+(?:for|to|about)\s+/gi, '')
  t = t.replace(/which\s+anyone\s+can\s+(?:do|complete|grab)/gi, '')
  t = t.replace(/\b(?:a\s+)?bount(?:y|ies)\b/gi, '')
  t = t.replace(/for\s+anyone/gi, '')
  t = t.replace(/anyone\s+can\s+(?:do|grab|claim)/gi, '')
  t = t.replace(/up\s+for\s+grabs/gi, '')
  t = t.replace(/worth\s+\d+\s+(?:pts?|points?)/gi, '')
  t = t.replace(/\d+\s+(?:pts?|points?)/gi, '')
  t = t.replace(/every\s+(?:\d+\s+)?(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
  t = t.replace(/\b(?:daily|weekly|monthly|fortnightly)\b/gi, '')
  t = t.replace(/(?:remind|assign(?:ed)?\s+to|for)\s+[A-Z][a-z]+/gi, '')
  // Strip date phrases
  const parsed = chrono.parse(t)
  for (const p of parsed) t = t.replace(p.text, '')
  // Clean up
  t = t.replace(/\s+/g, ' ').replace(/^[\s,\-–]+|[\s,\-–]+$/g, '').trim()
  // Title-case if short
  if (t.split(' ').length <= 5) {
    t = t.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ')
  }
  return t || text.trim().slice(0, 40)
}

export async function parseNaturalLanguage(input: string): Promise<NLPResult> {
  const now = new Date()
  const chronoParsed = chrono.parse(input, now, { forwardDate: true })
  const due_at = chronoParsed[0]?.date()?.toISOString() ?? null

  // Fast local parse — works without any API key
  const localResult: NLPResult = {
    title:           buildTitle(input),
    is_bounty:       detectBounty(input),
    recurrence_rule: quickRecurrence(input),
    point_bounty:    extractPoints(input),
    due_at,
    assignee_name:   extractAssigneeName(input),
  }

  // Enhance with Claude if API key is available
  if (!process.env.ANTHROPIC_API_KEY) return localResult

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Family task parser. Return ONLY JSON, no explanation.
Today: ${now.toDateString()}

Rules:
- title: 1-4 word clean title. Strip "bounty", recurrence, points, names. "Dishwasher bounty every day"→"Dishwasher", "take out the bins"→"Take Out Bins"
- is_bounty: true if the word "bounty" appears OR mentions anyone/whoever/up for grabs/family can do it
- point_bounty: number if mentioned (e.g. "5 pts", "10 points"), else null
- recurrence_rule: RRULE string (FREQ=DAILY, FREQ=WEEKLY;BYDAY=TU etc) or null
- due_at: ISO datetime if specific date/time mentioned, else null
- assignee_name: first name if assigned to someone, else null

Input: "${input}"
Return: {"title":"","is_bounty":false,"point_bounty":null,"recurrence_rule":null,"due_at":null,"assignee_name":null}`,
      }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return {
      title:           json.title           || localResult.title,
      is_bounty:       json.is_bounty       ?? localResult.is_bounty,
      recurrence_rule: json.recurrence_rule ?? localResult.recurrence_rule,
      point_bounty:    json.point_bounty    ?? localResult.point_bounty,
      due_at:          json.due_at          ?? localResult.due_at,
      assignee_name:   json.assignee_name   ?? localResult.assignee_name,
    }
  } catch {
    return localResult
  }
}
