'use client'

import { useState } from 'react'
import { X, Loader2, Plus, Trash2, ListPlus } from 'lucide-react'
import { format } from 'date-fns'
import type { Profile, TaskFormData, NLPResult } from '@/types'

interface ParsedTask {
  raw: string
  form: TaskFormData
  included: boolean
}

interface Props {
  members: Profile[]
  onSave: (tasks: TaskFormData[]) => Promise<void>
  onClose: () => void
}

function emptyForm(raw: string): TaskFormData {
  return { title: raw.slice(0, 40), notes: '', assigned_to: '', due_at: '', due_time: '', recurrence_rule: '', point_bounty: 10, is_bounty: false }
}

/* ── Helpers for structured "Person — Task — Date — Duration" lines ──── */
function durationToPts(s: string): number | null {
  const hr  = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/i)
  const min = s.match(/(\d+)\s*(?:min|minute)/i)
  if (hr)  return Math.round(parseFloat(hr[1]) * 20)
  if (min) return Math.round(parseInt(min[1]) / 30 * 10)
  return null
}

function parseIsoDate(s: string): string | null {
  const months: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  }
  // "Fri 24 Apr" or "24 Apr"
  const named = s.match(/(?:\w+\s+)?(\d{1,2})\s+([a-z]{3})/i) ?? s.match(/([a-z]{3})\s+(\d{1,2})/i)
  if (named) {
    const [d, m] = /\d/.test(named[1]) ? [named[1], named[2]] : [named[2], named[1]]
    const mo = months[m.toLowerCase().slice(0,3)]
    if (mo) return `${new Date().getFullYear()}-${mo}-${d.padStart(2,'0')}`
  }
  // numeric 24/04 or 2025-04-24
  const num = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/)
  if (num) return `${new Date().getFullYear()}-${num[2].padStart(2,'0')}-${num[1].padStart(2,'0')}`
  return null
}

function fuzzyMember(name: string, members: Profile[]): Profile | null {
  const n = name.toLowerCase().trim()
  return (
    members.find(m => m.name.toLowerCase() === n) ??
    members.find(m => m.name.toLowerCase().startsWith(n) || n.startsWith(m.name.toLowerCase())) ??
    members.find(m => n.split(/\s+/).some(w => w.length > 2 && m.name.toLowerCase().includes(w))) ??
    null
  )
}

function tryParseStructuredLine(line: string, members: Profile[]): ParsedTask | null {
  const parts = line.split(/\s*(?:—|--|–|-(?=\s))\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const member = fuzzyMember(parts[0], members)
  if (!member) return null

  let pts: number | null = null
  let dateStr: string | null = null
  for (let i = 2; i < parts.length; i++) {
    if (pts === null)     { const p = durationToPts(parts[i]);  if (p !== null) { pts = p; continue } }
    if (dateStr === null) { const d = parseIsoDate(parts[i]);   if (d !== null) { dateStr = d; continue } }
  }

  return {
    raw: line,
    included: true,
    form: {
      title:           parts[1],
      notes:           '',
      assigned_to:     member.id,
      due_at:          dateStr ?? '',
      due_time:        dateStr ? '09:00' : '',
      recurrence_rule: '',
      point_bounty:    pts ?? 10,
      is_bounty:       false,
    },
  }
}

/* ── Batched NLP calls (max 5 in flight at once) ─────────────────────── */
async function batchNlp(lines: string[], members: Profile[]): Promise<ParsedTask[]> {
  const results: ParsedTask[] = []
  const BATCH = 5
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH)
    const chunkResults = await Promise.all(
      chunk.map(async (line): Promise<ParsedTask> => {
        try {
          const res = await fetch('/api/nlp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line }),
          })
          const r: NLPResult = await res.json()
          const due = r.due_at ? new Date(r.due_at) : null
          const matched = r.assignee_name
            ? members.find(m => m.name.toLowerCase().startsWith(r.assignee_name!.toLowerCase()))
            : null
          return {
            raw: line,
            included: true,
            form: {
              title:           r.title || line.slice(0, 40),
              notes:           '',
              assigned_to:     matched?.id ?? '',
              due_at:          due ? format(due, 'yyyy-MM-dd') : '',
              due_time:        due ? format(due, 'HH:mm') : '',
              recurrence_rule: r.recurrence_rule ?? '',
              point_bounty:    r.point_bounty ?? 10,
              is_bounty:       r.is_bounty,
            },
          }
        } catch {
          return { raw: line, included: true, form: emptyForm(line) }
        }
      })
    )
    results.push(...chunkResults)
  }
  return results
}

export function BulkAddModal({ members, onSave, onClose }: Props) {
  const [input,   setInput]   = useState('')
  const [parsing, setParsing] = useState(false)
  const [tasks,   setTasks]   = useState<ParsedTask[]>([])
  const [saving,  setSaving]  = useState(false)

  async function handleParse() {
    const lines = input.split('\n').map(l => l.trim()).filter(l => l.length >= 2)
    if (!lines.length) return
    setParsing(true)

    const structured: ParsedTask[] = []
    const nlpLines:   string[]     = []

    for (const line of lines) {
      const s = tryParseStructuredLine(line, members)
      if (s) structured.push(s)
      else   nlpLines.push(line)
    }

    const nlpResults = nlpLines.length > 0 ? await batchNlp(nlpLines, members) : []
    setTasks([...structured, ...nlpResults])
    setParsing(false)
  }

  async function handleSave() {
    const toSave = tasks.filter(t => t.included).map(t => t.form)
    if (!toSave.length) return
    setSaving(true)
    await onSave(toSave)
    setSaving(false)
  }

  function toggle(i: number) {
    setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, included: !t.included } : t))
  }

  function remove(i: number) {
    setTasks(prev => prev.filter((_, idx) => idx !== i))
  }

  const included = tasks.filter(t => t.included).length

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <ListPlus size={20} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-900">Bulk add tasks</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {tasks.length === 0 ? (
            <>
              <p className="text-sm text-gray-500">
                One task per line. Natural language works — points, dates, bounty and repeating all get detected automatically.
              </p>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={"Dishwasher bounty every day 5 pts\nRemind Sarah dentist next Monday 25 pts\nHoover the living room weekly 10 points\nTake out bins every Tuesday bounty\nClean bathroom this Friday 15 pts"}
                rows={7}
                className="w-full border-2 border-indigo-100 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none placeholder:text-gray-300 transition-colors bg-indigo-50/40"
              />
              <button
                onClick={handleParse}
                disabled={parsing || input.trim().length < 2}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {parsing
                  ? <><Loader2 size={16} className="animate-spin" /> Parsing {input.split('\n').filter(l => l.trim().length >= 2).length} tasks…</>
                  : 'Parse tasks'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-800">{included}</span> of {tasks.length} tasks selected. Tap a task to toggle it.
              </p>

              <div className="space-y-2">
                {tasks.map((t, i) => (
                  <div
                    key={i}
                    onClick={() => toggle(i)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      t.included ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-gray-50 opacity-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      t.included ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                    }`}>
                      {t.included && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{t.form.title}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {t.form.is_bounty && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">⚡ Bounty</span>
                        )}
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {t.form.point_bounty} pts
                        </span>
                        {t.form.due_at && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                            📅 {t.form.due_at}
                          </span>
                        )}
                        {t.form.recurrence_rule && (
                          <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">↻ Repeating</span>
                        )}
                        {t.form.assigned_to && (
                          <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">
                            {members.find(m => m.id === t.form.assigned_to)?.name ?? 'Assigned'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={e => { e.stopPropagation(); remove(i) }}
                      className="shrink-0 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} className="text-gray-300 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setTasks([])}
                  className="flex-1 border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-all text-sm"
                >
                  Start over
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || included === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {saving
                    ? <><Loader2 size={15} className="animate-spin" /> Adding…</>
                    : <><Plus size={15} /> Add {included} task{included !== 1 ? 's' : ''}</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
