'use client'

import { useState } from 'react'
import { Pencil, Trash2, Repeat, Zap } from 'lucide-react'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import type { Task } from '@/types'

interface Props {
  task: Task
  onComplete: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}

function formatDue(due: string) {
  const d = new Date(due)
  if (isToday(d))    return `Today ${format(d, 'h:mm a')}`
  if (isTomorrow(d)) return `Tomorrow ${format(d, 'h:mm a')}`
  return format(d, 'EEE d MMM')
}

/* ── Bounty card ─────────────────────────────────────────────────────────── */
function BountyCard({ task, onComplete, onDelete, onEdit }: Props) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    await onComplete(task.id)
    setLoading(false)
  }

  if (task.status === 'completed') return null

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4">
      {/* Decorative glow */}
      <div className="absolute -top-4 -right-4 w-20 h-20 bg-amber-200 rounded-full opacity-30 blur-xl" />

      <div className="flex items-start justify-between gap-3 relative">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5 w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-snug">{task.title}</p>
            {task.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{task.notes}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded-full">
                {task.recurrence_rule ? 'Daily' : 'One-time'} · Anyone
              </span>
              {task.recurrence_rule && <Repeat size={11} className="text-amber-500" />}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-sm font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-xl">
            +{task.point_bounty} pts
          </span>
          <div className="flex gap-1">
            <button onClick={() => onEdit(task)} className="p-1.5 text-amber-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(task.id)} className="p-1.5 text-amber-400 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handle}
        disabled={loading}
        className="mt-3 w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-xl transition-all"
      >
        {loading ? 'Claiming…' : `Claim +${task.point_bounty} pts →`}
      </button>
    </div>
  )
}

/* ── Regular task card ───────────────────────────────────────────────────── */
export function TaskCard({ task, onComplete, onDelete, onEdit }: Props) {
  const [loading, setLoading] = useState(false)

  if (task.is_bounty) return <BountyCard task={task} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />

  const isOverdue   = task.due_at && isPast(new Date(task.due_at)) && task.status !== 'completed'
  const isCompleted = task.status === 'completed'

  async function handle() {
    if (isCompleted) return
    setLoading(true)
    await onComplete(task.id)
    setLoading(false)
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 transition-all duration-200 ${isCompleted ? 'opacity-50' : 'hover:shadow-md'}`}>
      {/* Checkbox */}
      <button onClick={handle} disabled={loading || isCompleted}
        className="mt-0.5 shrink-0 disabled:cursor-default group">
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          isCompleted
            ? 'bg-emerald-500 border-emerald-500'
            : loading
              ? 'border-indigo-300 animate-pulse'
              : 'border-gray-300 group-hover:border-indigo-400'
        }`}>
          {isCompleted && (
            <svg viewBox="0 0 12 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1,5 4,9 11,1" />
            </svg>
          )}
        </div>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium text-gray-900 leading-snug ${isCompleted ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </p>
          <span className="shrink-0 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            {task.point_bounty} pts
          </span>
        </div>

        {task.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.notes}</p>}

        <div className="flex items-center gap-2.5 mt-2 flex-wrap">
          {task.assignee && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: task.assignee.avatar_color }}>
                {task.assignee.name[0].toUpperCase()}
              </div>
              <span className="text-xs text-gray-500">{task.assignee.name}</span>
            </div>
          )}
          {task.due_at && (
            <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
              {isOverdue ? '⚠ ' : '📅 '}{formatDue(task.due_at)}
            </span>
          )}
          {task.recurrence_rule && <Repeat size={11} className="text-indigo-400" />}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 shrink-0 self-start">
        <button onClick={() => onEdit(task)} className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
