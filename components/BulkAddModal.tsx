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
  return { title: raw.slice(0, 80), notes: '', assigned_to: '', due_at: '', due_time: '', recurrence_rule: '', point_bounty: 10, is_bounty: false }
}

/* ── Structured "Person — Task — Date — Duration" parser ──────────────── */
function durationToPts(s: string): number | null {
  const hr  = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/i)
  const min = s.match(/(\d+)\s*(?:min|minute)/i)
  if (hr)  return Math.round(parseFloat(hr[1]) * 20)
  if (min) return Math.round(parseInt(min[1]) / 30 * 10)
  return null
}

function parseIsoDate(s: string): string | null {
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  }
  const named = s.match(/(?:\w+\s+)?(\d{1,2})\s+([a-z]{3})/i) ?? s.match(/([a-z]{3})\s+(\d{1,2})/i)
  if (named) {
    const [d, m] = /\d/.test(named[1]) ? [named[1], named[2]] : [named[2], named[1]]
    const mo = months[m.toLowerCase().slice(0, 3)]
    if (mo) return `${new Date().getFullYear()}-${mo}-${d.padStart(2, '0')}`
  }
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
    raw: line, included: true,
    form: {
      title: parts[1], notes: '', assigned_to: member.id,
      due_at: dateStr ?? '', due_time: dateStr ? '09:00' : '',
      recurrence_rule: '', point_bounty: pts ?? 10, is_bounty: false,
    },
  }
}

/* ── Batched NLP calls (max 5 in flight at once) ─────────────────────── */
async function batchNlp(lines: string[], members: Profile[]): Promise<ParsedTask[]> {
  const results: ParsedTask[] = []
  for (let i = 0; i < lines.length; i += 5) {
    const chunk = lines.slice(i, i + 5)
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
            raw: line, included: true,
            form: {
              title:           r.title || line.slice(0, 80),
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

/* ── Main component ───────────────────────────────────────────────────── */
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
    const nlpLines: string[] = []
    for (const line of lines) {
      const s = tryParseStructuredLine(line, members)
      if (s) structured.push(s)
      else nlpLines.push(line)
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

  function updateForm(i: number, patch: Partial<TaskFormData>) {
    setTasks(prev => prev.map((t, idx) =>
      idx === i ? { ...t, form: { ...t.form, ...patch } } : t
    ))
  }

  const included = tasks.filter(t => t.included).length

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            <ListPlus size={20} className="text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-900">Bulk add tasks</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-4">
          {tasks.length === 0 ? (
            <>
              <p className="text-sm text-gray-500">
                One task per line. Supports <span className="font-medium text-gray-700">Person — Task — Date — Duration</span> or plain natural language.
              </p>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={"Captain Neen — Sort bedside drawers — Fri 24 Apr — 1 hr\nHoover the living room weekly 10 points\nTake out bins every Tuesday bounty"}
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
                <span className="font-semibold text-gray-800">{included}</span> of {tasks.length} tasks — edit any field, then confirm.
              </p>

              <div className="space-y-3">
                {tasks.map((t, i) => (
                  <div key={i} className={`rounded-2xl border-2 transition-all ${
                    t.included ? 'border-indigo-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'
                  }`}>
                    {/* Header row: checkbox + title + delete */}
                    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                      <button
                        onClick={() => toggle(i)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          t.included ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                        }`}
                      >
                        {t.included && <span className="text-white text-[10px] font-bold">✓</span>}
                      </button>
                      <input
                        value={t.form.title}
                        onChange={e => updateForm(i, { title: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        placeholder="Task title"
                        className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent focus:border-indigo-300 focus:outline-none py-0.5 min-w-0"
                      />
                      <button
                        onClick={e => { e.stopPropagation(); remove(i) }}
                        className="shrink-0 p-1 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} className="text-gray-300 hover:text-red-400" />
                      </button>
                    </div>

                    {/* Editable fields row */}
                    <div className="flex flex-wrap gap-2 px-3 pb-3" onClick={e => e.stopPropagation()}>

                      {/* Assignee */}
                      <select
                        value={t.form.assigned_to}
                        onChange={e => updateForm(i, { assigned_to: e.target.value })}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 max-w-[130px]"
                      >
                        <option value="">Unassigned</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>

                      {/* Points */}
                      <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={t.form.point_bounty}
                          onChange={e => updateForm(i, { point_bounty: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-10 text-xs font-bold text-amber-700 bg-transparent focus:outline-none text-center"
                        />
                        <span className="text-xs text-amber-600">pts</span>
                      </div>

                      {/* Due date */}
                      <input
                        type="date"
                        value={t.form.due_at}
                        onChange={e => updateForm(i, { due_at: e.target.value })}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />

                      {/* Bounty toggle */}
                      <button
                        onClick={() => updateForm(i, { is_bounty: !t.form.is_bounty, assigned_to: !t.form.is_bounty ? '' : t.form.assigned_to })}
                        className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-colors ${
                          t.form.is_bounty
                            ? 'bg-amber-100 border-amber-300 text-amber-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-amber-200'
                        }`}
                      >
                        ⚡ Bounty
                      </button>

                      {/* Recurring */}
                      <select
                        value={t.form.recurrence_rule}
                        onChange={e => updateForm(i, { recurrence_rule: e.target.value })}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      >
                        <option value="">No repeat</option>
                        <option value="FREQ=DAILY">Daily</option>
                        <option value="FREQ=WEEKLY">Weekly</option>
                        <option value="FREQ=MONTHLY">Monthly</option>
                        <option value="FREQ=WEEKLY;BYDAY=MO">Every Mon</option>
                        <option value="FREQ=WEEKLY;BYDAY=TU">Every Tue</option>
                        <option value="FREQ=WEEKLY;BYDAY=WE">Every Wed</option>
                        <option value="FREQ=WEEKLY;BYDAY=TH">Every Thu</option>
                        <option value="FREQ=WEEKLY;BYDAY=FR">Every Fri</option>
                        <option value="FREQ=WEEKLY;BYDAY=SA">Every Sat</option>
                        <option value="FREQ=WEEKLY;BYDAY=SU">Every Sun</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
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
