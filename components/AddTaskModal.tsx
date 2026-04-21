'use client'

import { useState, useEffect } from 'react'
import { X, Wand2, Loader2, ChevronDown, Zap } from 'lucide-react'
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
  const [tab, setTab]           = useState<'nlp' | 'manual'>('nlp')
  const [nlpText, setNlpText]   = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [form, setForm]         = useState<TaskFormData>(emptyForm())
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (editTask) {
      setTab('manual')
      const due = editTask.due_at ? new Date(editTask.due_at) : null
      setForm({
        title: editTask.title, notes: editTask.notes ?? '',
        assigned_to: editTask.assigned_to ?? '',
        due_at:   due ? format(due, 'yyyy-MM-dd') : '',
        due_time: due ? format(due, 'HH:mm') : '',
        recurrence_rule: editTask.recurrence_rule ?? '',
        point_bounty: editTask.point_bounty,
        is_bounty: editTask.is_bounty,
      })
    }
  }, [editTask])

  async function handleNLP() {
    if (!nlpText.trim()) return
    setNlpLoading(true)
    try {
      const res  = await fetch('/api/nlp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: nlpText }) })
      const r: NLPResult = await res.json()
      const due  = r.due_at ? new Date(r.due_at) : null
      const matched = r.assignee_name ? members.find(m => m.name.toLowerCase().startsWith(r.assignee_name!.toLowerCase())) : null
      setForm(prev => ({
        ...prev,
        title:           r.title || nlpText,
        due_at:          due ? format(due, 'yyyy-MM-dd') : '',
        due_time:        due ? format(due, 'HH:mm') : '',
        assigned_to:     matched?.id ?? prev.assigned_to,
        recurrence_rule: r.recurrence_rule ?? '',
        point_bounty:    r.point_bounty ?? prev.point_bounty,
        is_bounty:       r.is_bounty,
      }))
      setTab('manual')
    } catch {}
    setNlpLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  function set<K extends keyof TaskFormData>(k: K, v: TaskFormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const isBounty = form.is_bounty

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900">
            {editTask ? 'Edit task' : isBounty ? '⚡ Add bounty' : 'Add task'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        {/* Tabs */}
        {!editTask && (
          <div className="flex gap-1 px-5 pb-3">
            {(['nlp', 'manual'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t === 'nlp' ? '✨ Smart input' : 'Manual'}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 pb-6 space-y-4">

          {/* NLP tab */}
          {tab === 'nlp' && (
            <div className="space-y-3">
              <textarea value={nlpText} onChange={e => setNlpText(e.target.value)}
                placeholder='e.g. "Make a daily bounty for dishwasher worth 5 points" or "Remind Sarah about vet appointment next Friday at 4pm for 25 points"'
                rows={3}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNLP() } }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder:text-gray-300"
              />
              <button onClick={handleNLP} disabled={!nlpText.trim() || nlpLoading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors">
                {nlpLoading ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />}
                {nlpLoading ? 'Parsing…' : 'Parse & fill form'}
              </button>
              <button onClick={() => setTab('manual')} className="w-full text-sm text-gray-400 hover:text-gray-600 py-1">
                Fill manually instead
              </button>
            </div>
          )}

          {/* Manual / form tab */}
          {tab === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Bounty toggle */}
              <button type="button" onClick={() => set('is_bounty', !isBounty)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                  isBounty ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isBounty ? 'bg-amber-100' : 'bg-gray-200'}`}>
                  <Zap size={18} className={isBounty ? 'text-amber-600 fill-amber-500' : 'text-gray-400'} />
                </div>
                <div className="text-left flex-1">
                  <p className={`text-sm font-semibold ${isBounty ? 'text-amber-800' : 'text-gray-600'}`}>Daily Bounty</p>
                  <p className="text-xs text-gray-400">Anyone can claim it for points</p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${isBounty ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isBounty ? 'left-5' : 'left-1'}`} />
                </div>
              </button>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task *</label>
                <input type="text" required value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="What needs doing?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Optional details"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              {/* Assignee — hidden for bounties */}
              {!isBounty && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
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

              {/* Due date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                  <input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              {/* Repeat */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat</label>
                <div className="relative">
                  <select value={form.recurrence_rule} onChange={e => set('recurrence_rule', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Point bounty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Point bounty <span className="text-xs text-gray-400 ml-1">awarded on completion</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {POINT_PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => set('point_bounty', p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        form.point_bounty === p
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`}>
                      {p}
                    </button>
                  ))}
                  <input type="number" min={1} max={9999} value={form.point_bounty}
                    onChange={e => set('point_bounty', parseInt(e.target.value) || 1)}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <span className="text-sm text-gray-400">pts</span>
                </div>
              </div>

              <button type="submit" disabled={saving || !form.title.trim()}
                className={`w-full text-white font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 ${
                  isBounty
                    ? 'bg-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-200'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200'
                }`}>
                {saving ? 'Saving…' : editTask ? 'Save changes' : isBounty ? '⚡ Add bounty' : 'Add task'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
