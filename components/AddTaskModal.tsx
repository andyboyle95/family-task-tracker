'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, Zap, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import type { Profile, Task, TaskFormData, NLPResult } from '@/types'

interface Props {
  members: Profile[]
  currentUserId: string
  editTask?: Task | null
  onSave: (data: TaskFormData) => Promise<void>
  onClose: () => void
}

const POINT_PRESETS = [5, 10, 25, 50, 100]

const RECURRENCE_OPTIONS = [
  { label: 'Does not repeat', value: '' },
  { label: 'Every day',       value: 'FREQ=DAILY' },
  { label: 'Every week',      value: 'FREQ=WEEKLY' },
  { label: 'Every Monday',    value: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: 'Every Tuesday',   value: 'FREQ=WEEKLY;BYDAY=TU' },
  { label: 'Every Wednesday', value: 'FREQ=WEEKLY;BYDAY=WE' },
  { label: 'Every Thursday',  value: 'FREQ=WEEKLY;BYDAY=TH' },
  { label: 'Every Friday',    value: 'FREQ=WEEKLY;BYDAY=FR' },
  { label: 'Every Saturday',  value: 'FREQ=WEEKLY;BYDAY=SA' },
  { label: 'Every Sunday',    value: 'FREQ=WEEKLY;BYDAY=SU' },
  { label: 'Fortnightly',     value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Monthly',         value: 'FREQ=MONTHLY' },
]

function emptyForm(): TaskFormData {
  return { title: '', notes: '', assigned_to: '', due_at: '', due_time: '', recurrence_rule: '', point_bounty: 10, is_bounty: false }
}

export function AddTaskModal({ members, currentUserId, editTask, onSave, onClose }: Props) {
  const [nlpInput, setNlpInput] = useState('')
  const [parsing,  setParsing]  = useState(false)
  const [parsedOk, setParsedOk] = useState(false)
  const [form,     setForm]     = useState<TaskFormData>(emptyForm())
  const [saving,   setSaving]   = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (!editTask) return
    const due = editTask.due_at ? new Date(editTask.due_at) : null
    setForm({
      title: editTask.title,
      notes: editTask.notes ?? '',
      assigned_to: editTask.assigned_to ?? '',
      due_at:   due ? format(due, 'yyyy-MM-dd') : '',
      due_time: due ? format(due, 'HH:mm') : '',
      recurrence_rule: editTask.recurrence_rule ?? '',
      point_bounty: editTask.point_bounty,
      is_bounty: editTask.is_bounty,
    })
  }, [editTask])

  // Auto-parse as the user types (1 s debounce)
  useEffect(() => {
    if (editTask || nlpInput.trim().length < 4) return
    setParsedOk(false)
    const timer = setTimeout(async () => {
      setParsing(true)
      try {
        const res = await fetch('/api/nlp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: nlpInput }),
        })
        const r: NLPResult = await res.json()
        const due     = r.due_at ? new Date(r.due_at) : null
        const matched = r.assignee_name
          ? members.find(m => m.name.toLowerCase().startsWith(r.assignee_name!.toLowerCase()))
          : null
        setForm(prev => ({
          ...prev,
          title:           r.title           || prev.title,
          is_bounty:       r.is_bounty,
          recurrence_rule: r.recurrence_rule ?? prev.recurrence_rule,
          point_bounty:    r.point_bounty    ?? prev.point_bounty,
          due_at:          due ? format(due, 'yyyy-MM-dd') : prev.due_at,
          due_time:        due ? format(due, 'HH:mm')      : prev.due_time,
          assigned_to:     matched?.id        ?? prev.assigned_to,
        }))
        setParsedOk(true)
      } catch {}
      setParsing(false)
    }, 1000)
    return () => clearTimeout(timer)
  }, [nlpInput, members, editTask])

  function set<K extends keyof TaskFormData>(k: K, v: TaskFormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const isBounty = form.is_bounty

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {editTask ? 'Edit task' : isBounty ? '⚡ Add bounty' : 'Add task'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-6 space-y-4">

          {/* ── Smart input (only when adding, not editing) ─────── */}
          {!editTask && (
            <div className="relative">
              <div className="absolute left-3 top-3 text-indigo-400 pointer-events-none">
                <Sparkles size={16} />
              </div>
              <textarea
                value={nlpInput}
                onChange={e => setNlpInput(e.target.value)}
                placeholder={'Try: "Dishwasher bounty every day 5 points"\nor: "Remind Sarah about dentist next Monday 25 pts"'}
                rows={2}
                className="w-full border-2 border-indigo-100 focus:border-indigo-400 rounded-xl pl-9 pr-10 py-3 text-sm focus:outline-none resize-none placeholder:text-gray-300 transition-colors bg-indigo-50/40"
              />
              {/* Parsing indicator */}
              <div className="absolute right-3 top-3">
                {parsing  && <Loader2 size={16} className="text-indigo-400 animate-spin" />}
                {parsedOk && !parsing && <span className="text-emerald-500 text-xs font-bold">✓</span>}
              </div>
              {parsedOk && !parsing && (
                <p className="text-xs text-indigo-500 mt-1 ml-1">Fields updated from your description</p>
              )}
            </div>
          )}

          {/* ── Bounty toggle ────────────────────────────────────── */}
          <button type="button" onClick={() => set('is_bounty', !isBounty)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              isBounty ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isBounty ? 'bg-amber-100' : 'bg-gray-200'}`}>
              <Zap size={16} className={isBounty ? 'text-amber-600 fill-amber-500' : 'text-gray-400'} />
            </div>
            <div className="text-left flex-1">
              <p className={`text-sm font-semibold ${isBounty ? 'text-amber-800' : 'text-gray-600'}`}>Daily Bounty</p>
              <p className="text-xs text-gray-400">Anyone in the family can claim it</p>
            </div>
            <div className={`w-10 h-6 rounded-full transition-colors relative ${isBounty ? 'bg-amber-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isBounty ? 'left-5' : 'left-1'}`} />
            </div>
          </button>

          {/* ── Title ────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Task title *</label>
            <input
              type="text" required value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs doing?"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
            />
          </div>

          {/* ── Notes ────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
            <input
              type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional details"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* ── Assignee (hidden for bounties) ───────────────────── */}
          {!isBounty && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Assign to</label>
              <div className="relative">
                <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? ' (me)' : ''}</option>)}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* ── Due date + time ──────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Due date</label>
              <input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Time</label>
              <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          {/* ── Repeat ───────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Repeat</label>
            <div className="relative">
              <select value={form.recurrence_rule} onChange={e => set('recurrence_rule', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* ── Points ───────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Points <span className="normal-case font-normal text-gray-400">awarded on completion</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {POINT_PRESETS.map(p => (
                <button key={p} type="button" onClick={() => set('point_bounty', p)}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all ${
                    form.point_bounty === p
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}>
                  {p}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                <input type="number" min={1} max={9999} value={form.point_bounty}
                  onChange={e => set('point_bounty', parseInt(e.target.value) || 1)}
                  className="w-20 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <span className="text-sm text-gray-400">pts</span>
              </div>
            </div>
          </div>

          {/* ── Submit ───────────────────────────────────────────── */}
          <button type="submit" disabled={saving || !form.title.trim()}
            className={`w-full font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-white ${
              isBounty
                ? 'bg-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-200'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200'
            }`}>
            {saving ? 'Saving…' : editTask ? 'Save changes' : isBounty ? '⚡ Add bounty' : 'Add task'}
          </button>

        </form>
      </div>
    </div>
  )
}
