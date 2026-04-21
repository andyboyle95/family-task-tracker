import Anthropic from '@anthropic-ai/sdk'
import type { NLPResult } from '@/types'

const RRULE_MAP: [RegExp, string][] = [
  [/every\s+day|daily/i,              'FREQ=DAILY'],
  [/every\s+week|weekly/i,            'FREQ=WEEKLY'],
  [/every\s+month|monthly/i,          'FREQ=MONTHLY'],
  [/every\s+mon(day)?/i,              'FREQ=WEEKLY;BYDAY=MO'],
  [/every\s+tue(sday)?/i,             'FREQ=WEEKLY;BYDAY=TU'],
  [/every\s+wed(nesday)?/i,           'FREQ=WEEKLY;BYDAY=WE'],
  [/every\s+thu(rsday)?/i,            'FREQ=WEEKLY;BYDAY=TH'],
  [/every\s+fri(day)?/i,              'FREQ=WEEKLY;BYDAY=FR'],
  [/every\s+sat(urday)?/i,            'FREQ=WEEKLY;BYDAY=SA'],
  [/every\s+sun(day)?/i,              'FREQ=WEEKLY;BYDAY=SU'],
  [/every\s+2\s+weeks|fortnightly/i,  'FREQ=WEEKLY;INTERVAL=2'],
]

function quickRecurrence(text: string): string | null {
  for (const [re, rule] of RRULE_MAP) if (re.test(text)) return rule
  return null
}

export async function parseNaturalLanguage(input: string): Promise<NLPResult> {
  const now = new Date()

  // Always run Claude — the prompt is good enough to handle simple cases too
  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a parser for a family task app. Extract task details and return ONLY valid JSON — no explanation, no markdown.

Today: ${now.toDateString()}

Rules:
- "title": 1-4 word clean title. Strip filler words. Examples: "doing the dishwasher" → "Dishwasher", "taking out the bins every tuesday" → "Take Out Bins", "vet appointment next friday at 4pm" → "Vet Appointment", "feed the dog" → "Feed the Dog"
- "is_bounty": true if task mentions "anyone", "anyone can do it", "whoever", "up for grabs", or is clearly an open household chore with no specific person. false otherwise.
- "recurrence_rule": RRULE string if recurring, else null. "daily"→"FREQ=DAILY", "every tuesday"→"FREQ=WEEKLY;BYDAY=TU", "weekly"→"FREQ=WEEKLY", "every month"→"FREQ=MONTHLY". null if one-off.
- "point_bounty": integer if mentioned ("worth 5 points"→5, "50pts"→50, "5 points"→5). null if not mentioned.
- "due_at": ISO 8601 datetime if a specific date/time is mentioned, else null. Use today's year. "next friday at 4pm" → calculate from today.
- "assignee_name": first name only if task is assigned to a specific person ("remind Sarah"→"Sarah"). null if unassigned or bounty.

Input: "${input}"

Return exactly:
{"title":"...","is_bounty":false,"recurrence_rule":null,"point_bounty":null,"due_at":null,"assignee_name":null}`,
      }],
    })

    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')

    return {
      title:          json.title          ?? input.slice(0, 60),
      is_bounty:      json.is_bounty      ?? false,
      recurrence_rule: json.recurrence_rule ?? quickRecurrence(input),
      point_bounty:   typeof json.point_bounty === 'number' ? json.point_bounty : null,
      due_at:         json.due_at         ?? null,
      assignee_name:  json.assignee_name  ?? null,
    }
  } catch {
    // Fallback: basic extraction without Claude
    return {
      title:          input.slice(0, 60),
      is_bounty:      /anyone|whoever|up for grabs/i.test(input),
      recurrence_rule: quickRecurrence(input),
      point_bounty:   null,
      due_at:         null,
      assignee_name:  null,
    }
  }
}
