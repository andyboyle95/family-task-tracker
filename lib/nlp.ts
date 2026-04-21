import * as chrono from 'chrono-node'
import Anthropic from '@anthropic-ai/sdk'
import type { NLPResult } from '@/types'

const RECURRENCE_PATTERNS: [RegExp, string][] = [
  [/every\s+day|daily/i, 'FREQ=DAILY'],
  [/every\s+week|weekly/i, 'FREQ=WEEKLY'],
  [/every\s+month|monthly/i, 'FREQ=MONTHLY'],
  [/every\s+monday/i, 'FREQ=WEEKLY;BYDAY=MO'],
  [/every\s+tuesday/i, 'FREQ=WEEKLY;BYDAY=TU'],
  [/every\s+wednesday/i, 'FREQ=WEEKLY;BYDAY=WE'],
  [/every\s+thursday/i, 'FREQ=WEEKLY;BYDAY=TH'],
  [/every\s+friday/i, 'FREQ=WEEKLY;BYDAY=FR'],
  [/every\s+saturday/i, 'FREQ=WEEKLY;BYDAY=SA'],
  [/every\s+sunday/i, 'FREQ=WEEKLY;BYDAY=SU'],
  [/every\s+2\s+weeks|fortnightly/i, 'FREQ=WEEKLY;INTERVAL=2'],
]

function extractRecurrence(text: string): string | null {
  for (const [pattern, rule] of RECURRENCE_PATTERNS) {
    if (pattern.test(text)) return rule
  }
  return null
}

function stripTemporalPhrases(text: string): string {
  const parsed = chrono.parse(text)
  let result = text
  for (const p of parsed) {
    result = result.replace(p.text, '').trim()
  }
  return result.replace(/\s+/g, ' ').trim()
}

export async function parseNaturalLanguage(input: string): Promise<NLPResult> {
  const now = new Date()

  const chronoResults = chrono.parse(input, now, { forwardDate: true })
  const due_at = chronoResults[0]?.date()?.toISOString() ?? null
  const recurrence_rule = extractRecurrence(input)

  // For simple inputs, skip Claude and return fast
  const isSimple = input.split(' ').length <= 6 && !input.match(/remind|assign|for\s+\w+/i)
  if (isSimple) {
    return {
      title: stripTemporalPhrases(input),
      due_at,
      assignee_name: null,
      recurrence_rule,
      point_bounty: null,
    }
  }

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Extract task details from this text and return JSON only. No explanation.

Text: "${input}"
Today: ${now.toDateString()}

Return exactly this JSON structure:
{
  "title": "clean task title without date/time phrases",
  "assignee_name": "first name of person if mentioned, else null",
  "point_bounty": number if mentioned (e.g. '50 points'), else null
}`,
        },
      ],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')

    return {
      title: json.title ?? stripTemporalPhrases(input),
      due_at,
      assignee_name: json.assignee_name ?? null,
      recurrence_rule,
      point_bounty: json.point_bounty ?? null,
    }
  } catch {
    return {
      title: stripTemporalPhrases(input),
      due_at,
      assignee_name: null,
      recurrence_rule,
      point_bounty: null,
    }
  }
}
