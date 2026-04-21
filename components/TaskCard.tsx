'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, Repeat, Trash2, Pencil } from 'lucide-react'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import type { Task } from '@/types'

interface Props {
  task: Task
  currentUserId: string
  onComplete: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}

function formatDue(due: string) {
  const d = new Date(due)
  if (isToday(d)) return `Today ${format(d, 'h:mm a')}`
  if (isTomorrow(d)) return `Tomorrow ${format(d, 'h:mm a')}`
  return format(d, 'EEE d MMM, h:mm a')
}

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#0284c7','#16a34a','#ea580c',
]

export function TaskCard({ task, currentUserId, onComplete, onDelete, onEdit }: Props) {
  const [loading, setLoading] = useState(false)
  const isOverdue = task.due_at && isPast(new Date(task.due_at)) && task.status !== 'completed'
  const isCompleted = task.status === 'completed'

  async function handleComplete() {
    setLoading(true)
    await onComplete(task.id)
    setLoading(false)
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3 transition-opacity ${isCompleted ? 'opacity-50' : ''}`}>
      {/* Completion toggle */}
      <button
        onClick={handleComplete}
        disabled={loading || isCompleted}
        className="mt-0.5 shrink-0 text-gray-300 hover:text-indigo-500 transition-colors disabled:cursor-default"
      >
        {isCompleted
          ? <CheckCircle2 size={24} className="text-green-500" />
          : <Circle size={24} className={loading ? 'animate-pulse text-indigo-400' : ''} />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium text-gray-900 leading-snug ${isCompleted ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </p>
          {/* Point bounty badge */}
          <span className="shrink-0 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {task.point_bounty} pts
          </span>
        </div>

        {task.notes && (
          <p className="text-sm text-gray-500 mt-0.5 truncate">{task.notes}</p>
        )}

        <div className="flex items-center gap-3 mt-2">
          {/* Assignee */}
          {task.assignee && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: task.assignee.avatar_color }}
              >
                {task.assignee.name[0].toUpperCase()}
              </div>
              <span className="text-xs text-gray-500">{task.assignee.name}</span>
            </div>
          )}

          {/* Due date */}
          {task.due_at && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {isOverdue && '⚠ '}{formatDue(task.due_at)}
            </span>
          )}

          {/* Recurring */}
          {task.recurrence_rule && (
            <Repeat size={12} className="text-indigo-400" />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onEdit(task)} className="p-1.5 text-gray-300 hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-50">
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
