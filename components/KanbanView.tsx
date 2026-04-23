'use client'

import { useState } from 'react'
import { Zap, Repeat, Calendar, CheckCircle2, Loader2, RotateCcw, Pencil } from 'lucide-react'
import { isPast, isToday, isTomorrow, format } from 'date-fns'
import type { Task, Profile } from '@/types'

interface Props {
  tasks: Task[]
  members: Profile[]
  currentUserId: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}

function dueBadge(due: string, completed: boolean) {
  if (completed) return null
  const d = new Date(due)
  const overdue   = isPast(d) && !isToday(d)
  const todayDue  = isToday(d)
  const tomorrowDue = isTomorrow(d)
  const label = todayDue ? `Today ${format(d,'h:mma')}` : tomorrowDue ? 'Tomorrow' : format(d, 'd MMM')
  return { label, overdue, todayDue }
}

function KanbanCard({
  task, color, onComplete, onUncomplete, onEdit,
}: {
  task: Task; color: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}) {
  const [loading, setLoading] = useState(false)
  const done = task.status === 'completed'
  const due  = task.due_at ? dueBadge(task.due_at, done) : null

  async function handleComplete() {
    setLoading(true)
    await (done ? onUncomplete(task.id) : onComplete(task.id))
    setLoading(false)
  }

  return (
    <div
      className={`group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden ${done ? 'opacity-55' : ''}`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {/* Main content */}
      <div className="px-3 pt-2.5 pb-2">
        <p className={`text-xs font-semibold text-gray-800 leading-snug line-clamp-2 ${done ? 'line-through text-gray-400' : ''}`}>
          {task.title}
        </p>

        {/* Badge row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Points */}
          <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
            {task.is_bounty && <Zap size={8} className="fill-amber-500 text-amber-500" />}
            {task.point_bounty}pts
          </span>

          {/* Due */}
          {due && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              due.overdue  ? 'bg-red-50 text-red-600 border border-red-200' :
              due.todayDue ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                             'bg-gray-50 text-gray-500 border border-gray-200'
            }`}>
              <Calendar size={8} />
              {due.label}
            </span>
          )}

          {/* Recurring */}
          {task.recurrence_rule && (
            <span className="inline-flex items-center text-[10px] text-purple-500">
              <Repeat size={9} />
            </span>
          )}
        </div>
      </div>

      {/* Action bar — appears on hover */}
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!done && (
          <button
            onClick={() => onEdit(task)}
            className="p-1 rounded-md bg-white/90 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors shadow-sm"
          >
            <Pencil size={11} />
          </button>
        )}
        <button
          onClick={handleComplete}
          disabled={loading}
          className={`p-1 rounded-md bg-white/90 shadow-sm transition-colors ${
            done ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50'
          }`}
        >
          {loading
            ? <Loader2 size={11} className="animate-spin" />
            : done
              ? <RotateCcw size={11} />
              : <CheckCircle2 size={11} />}
        </button>
      </div>
    </div>
  )
}

interface Column {
  id: string
  label: string
  color: string
  emoji: string
  tasks: Task[]
  totalPts: number
}

export function KanbanView({ tasks, members, currentUserId, onComplete, onUncomplete, onEdit }: Props) {
  const pending   = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')

  const bounties = pending.filter(t => t.is_bounty)

  const columns: Column[] = []

  // Bounties column
  if (bounties.length > 0) {
    columns.push({
      id: '__bounties',
      label: 'Bounties',
      color: '#f59e0b',
      emoji: '⚡',
      tasks: bounties,
      totalPts: bounties.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  // Per-member columns
  for (const m of members) {
    const mine = pending.filter(t => !t.is_bounty && t.assigned_to === m.id)
    const doneMine = completed.filter(t => t.assigned_to === m.id || t.completed_by === m.id)
    const allCards = [
      ...mine,
      ...doneMine.slice(0, 3), // show last 3 completed per person
    ]
    columns.push({
      id: m.id,
      label: m.name,
      color: m.avatar_color,
      emoji: m.name[0].toUpperCase(),
      tasks: allCards,
      totalPts: mine.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  // Unassigned column
  const unassigned = pending.filter(t => !t.is_bounty && !t.assigned_to)
  if (unassigned.length > 0) {
    columns.push({
      id: '__unassigned',
      label: 'Unassigned',
      color: '#94a3b8',
      emoji: '?',
      tasks: unassigned,
      totalPts: unassigned.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  if (columns.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-3">🎉</p>
        <p className="font-semibold text-gray-700">All clear!</p>
        <p className="text-sm text-gray-400 mt-1">Tap + to add a task</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
      {columns.map(col => {
        const pendingCount = col.tasks.filter(t => t.status === 'pending').length
        const doneCount    = col.tasks.filter(t => t.status === 'completed').length
        const isMe = col.id === currentUserId

        return (
          <div
            key={col.id}
            className="flex-none w-52 snap-start flex flex-col rounded-2xl overflow-hidden"
            style={{ boxShadow: `0 2px 16px 0 ${col.color}22` }}
          >
            {/* Column header */}
            <div
              className="px-3 py-3 flex flex-col gap-1"
              style={{ background: `linear-gradient(135deg, ${col.color}22 0%, ${col.color}10 100%)`, borderTop: `3px solid ${col.color}` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {col.id.startsWith('__') ? (
                    <span className="text-base">{col.emoji}</span>
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                      style={{ backgroundColor: col.color }}
                    >
                      {col.emoji}
                    </div>
                  )}
                  <span className="text-sm font-bold text-gray-800 truncate">{col.label}</span>
                  {isMe && <span className="text-[9px] text-indigo-500 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded-full">you</span>}
                </div>
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center"
                  style={{ backgroundColor: `${col.color}30`, color: col.color }}
                >
                  {pendingCount}
                </span>
              </div>

              {/* Points + done streak */}
              <div className="flex items-center gap-2">
                {col.totalPts > 0 && (
                  <span className="text-[10px] font-semibold text-amber-600">{col.totalPts} pts pending</span>
                )}
                {doneCount > 0 && (
                  <span className="text-[10px] text-emerald-600 font-medium ml-auto">✓{doneCount} done</span>
                )}
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 bg-gray-50/80 px-2 py-2 space-y-2 overflow-y-auto max-h-[60vh]">
              {col.tasks.filter(t => t.status === 'pending').map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  color={col.color}
                  onComplete={onComplete}
                  onUncomplete={onUncomplete}
                  onEdit={onEdit}
                />
              ))}

              {/* Completed divider */}
              {doneCount > 0 && (
                <>
                  <div className="flex items-center gap-1.5 pt-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Done</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  {col.tasks.filter(t => t.status === 'completed').map(task => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      color={col.color}
                      onComplete={onComplete}
                      onUncomplete={onUncomplete}
                      onEdit={onEdit}
                    />
                  ))}
                </>
              )}

              {col.tasks.length === 0 && (
                <p className="text-[10px] text-gray-400 text-center py-4">Nothing here</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
