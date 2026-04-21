'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Wand2, Loader2, ChevronDown } from 'lucide-react'
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
  { label: 'Daily', value: 'FREQ=DAILY' },
  { label: 'Weekly', value: 'FREQ=WEEKLY' },
  { label: 'Every Monday', value: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: 'Every Tuesday', value: 'FREQ=WEEKLY;BYDAY=TU' },
  { label: 'Every Wednesday', value: 'FREQ=WEEKLY;BYDAY=WE' },
  { label: 'Every Thursday', value: 'FREQ=WEEKLY;BYDAY=TH' },
  { label: 'Every Friday', value: 'FREQ=WEEKLY;BYDAY=FR' },
  { label: 'Every Saturday', value: 'FREQ=WEEKLY;BYDAY=SA' },
  { label: 'Every Sunday', value: 'FREQ=WEEKLY;BYDAY=SU' },
  { label: 'Fortnightly', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Monthly', value: 'FREQ=MONTHLY' },
]

const emptyForm = (): TaskFormData => ({
  title: '', notes: '', assigned_to: '', due_at: '', due_time: '',
  recurrence_rule: '', point_bounty: 10,
})

export function AddTaskModal({ members, currentUserId, editTask, onSave, onClose }: Props) {
  const [tab, setTab] = useState<'nlp' | 'manual'>('nlp')
  const [nlpText, setNlpText] = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [form, setForm] = useState<TaskFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const nlpRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editTask) {
      setTab('manual')
      const due = editTask.due_at ? new Date(editTask.due_at) : null
      setForm({
        title: editTask.title,
        notes: editTask.notes ?? '',
        assigned_to: editTask.assigned_to ?? '',
        due_at: due ? format(due, 'yyyy-MM-dd') : '',
        due_time: due ? format(due, 'HH:mm') : '',
        recurrence_rule: editTask.recurrence_rule ?? '',
        point_bounty: editTask.point_bounty,
      })
    }
  }, [editTask])

  async function handleNLPParse() {
    if (!nlpText.trim()) return
    setNlpLoading(true)
    try {
      const res = await fetch('/api/nlp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlpText }),
      })
      const result: NLPResult = await res.json()
      const due = result.due_at ? new Date(result.due_at) : null
      const matched = result.assignee_name
        ? members.find(m => m.name.toLowerCase().startsWith(result.assignee_name!.toLowerCase()))
        : null
      setForm(prev => ({
        ...prev,
        title: result.title || nlpText,
        due_at: due ? format(due, 'yyyy-MM-dd') : '',
        due_time: due ? format(due, 'HH:mm') : '',
        assigned_to: matched?.id ?? prev.assigned_to,
        recurrence_rule: result.recurrence_rule ?? '',
        point_bounty: result.point_bounty ?? prev.point_bounty,
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

  function set(field: keyof TaskFormData, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editTask ? 'Edit task' : 'Add task'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        {!editTask && (
          <div className="flex border-b border-gray-100 px-5">
            {(['nlp', 'manual'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'nlp' ? '✨ Smart input' : 'Manual'}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* NLP Tab */}
          {tab === 'nlp' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Describe the task naturally
              </label>
              <textarea
                ref={nlpRef}
                value={nlpText}
                onChange={e => setNlpText(e.target.value)}
                placeholder='e.g. "Remind Sarah to take bins out every Tuesday" or "Vet appointment next Friday at 4pm — 25 points"'
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNLPParse() } }}
              />
              <button
                onClick={handleNLPParse}
                disabled={!nlpText.trim() || nlpLoading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 font-medium transition-colors"
              >
                {nlpLoading ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                {nlpLoading ? 'Parsing…' : 'Parse & fill form'}
              </button>
              <button onClick={() => setTab('manual')} className="w-full text-sm text-gray-400 hover:text-gray-600 py-1">
                Skip — fill manually
              </button>
            </div>
          )}

          {/* Manual / Form Tab */}
          {tab === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task *</label>
                <input
                  type="text" required value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text" value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Optional details"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Assign to */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
                <div className="relative">
                  <select
                    value={form.assigned_to}
                    onChange={e => set('assigned_to', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? ' (me)' : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Due date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                  <input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat</label>
                <div className="relative">
                  <select
                    value={form.recurrence_rule}
                    onChange={e => set('recurrence_rule', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none bg-white"
                  >
                    {RECURRENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Point bounty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Point bounty
                  <span className="ml-2 text-xs text-gray-400">awarded on completion</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {POINT_PRESETS.map(p => (
                    <button
                      key={p} type="button"
                      onClick={() => set('point_bounty', p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.point_bounty === p
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <input
                    type="number" min={1} max={9999}
                    value={form.point_bounty}
                    onChange={e => set('point_bounty', parseInt(e.target.value) || 1)}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                  />
                  <span className="text-sm text-gray-400">pts</span>
                </div>
              </div>

              <button
                type="submit" disabled={saving || !form.title.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold transition-colors mt-2"
              >
                {saving ? 'Saving…' : editTask ? 'Save changes' : 'Add task'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
