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
  const overdue     = isPast(d) && !isToday(d)
  const todayDue    = isToday(d)
  const tomorrowDue = isTomorrow(d)
  const label = todayDue ? `Today ${format(d, 'h:mma')}` : tomorrowDue ? 'Tomorrow' : format(d, 'd MMM')
  return { label, overdue, todayDue }
}

/* ── Card ─────────────────────────────────────────────────────────────────── */
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

  async function handleAction() {
    setLoading(true)
    await (done ? onUncomplete(task.id) : onComplete(task.id))
    setLoading(false)
  }

  return (
    <div
      className={`group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-150 ${done ? 'opacity-50' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Title + badges */}
      <div className="px-3 pt-3 pb-2">
        <p className={`text-[13px] font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-100">
            {task.is_bounty && <Zap size={8} className="fill-amber-500 text-amber-500" />}
            {task.point_bounty}pt
          </span>
          {due && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              due.overdue  ? 'bg-red-50 text-red-600 border border-red-100' :
              due.todayDue ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                             'bg-gray-50 text-gray-500 border border-gray-100'
            }`}>
              <Calendar size={8} />{due.label}
            </span>
          )}
          {task.recurrence_rule && <Repeat size={9} className="text-purple-400 shrink-0" />}
        </div>
      </div>

      {/* Actions — hover-only on mobile, always visible on desktop */}
      <div className="flex justify-end items-center gap-0.5 px-2 pb-2 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
        {!done && (
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <Pencil size={12} />
          </button>
        )}
        <button
          onClick={handleAction}
          disabled={loading}
          className={`p-1.5 rounded-lg transition-colors ${
            done
              ? 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
              : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50'
          }`}
        >
          {loading
            ? <Loader2 size={12} className="animate-spin" />
            : done
              ? <RotateCcw size={12} />
              : <CheckCircle2 size={12} />}
        </button>
      </div>
    </div>
  )
}

/* ── Column ───────────────────────────────────────────────────────────────── */
interface Column {
  id: string
  label: string
  color: string
  initial: string
  isBounty?: boolean
  tasks: Task[]
  totalPts: number
}

function KanbanColumn({
  col, currentUserId, onComplete, onUncomplete, onEdit,
}: {
  col: Column
  currentUserId: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}) {
  const pendingTasks   = col.tasks.filter(t => t.status === 'pending')
  const completedTasks = col.tasks.filter(t => t.status === 'completed')
  const isMe = col.id === currentUserId

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ boxShadow: `0 2px 20px 0 ${col.color}18` }}
    >
      {/* Header */}
      <div
        className="px-3 py-3 flex flex-col gap-1.5 shrink-0"
        style={{
          background: `linear-gradient(135deg, ${col.color}22 0%, ${col.color}08 100%)`,
          borderTop: `3px solid ${col.color}`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {col.isBounty ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${col.color}25` }}>
                <Zap size={14} className="fill-amber-500 text-amber-500" />
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                style={{ backgroundColor: col.color }}
              >
                {col.initial}
              </div>
            )}
            <span className="text-sm font-bold text-gray-800 truncate">{col.label}</span>
            {isMe && (
              <span className="text-[9px] text-indigo-500 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded-full shrink-0">
                you
              </span>
            )}
          </div>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center shrink-0"
            style={{ backgroundColor: `${col.color}25`, color: col.color }}
          >
            {pendingTasks.length}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {col.totalPts > 0
            ? <span className="text-[10px] font-semibold text-amber-600">{col.totalPts} pts pending</span>
            : <span />}
          {completedTasks.length > 0 && (
            <span className="text-[10px] text-emerald-600 font-medium">✓ {completedTasks.length} done</span>
          )}
        </div>
      </div>

      {/* Cards — no max-height, page scrolls */}
      <div className="bg-gray-50/60 px-2 pt-2 pb-3 space-y-2">
        {pendingTasks.map(task => (
          <KanbanCard
            key={task.id} task={task} color={col.color}
            onComplete={onComplete} onUncomplete={onUncomplete} onEdit={onEdit}
          />
        ))}

        {completedTasks.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 pt-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Done</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            {completedTasks.map(task => (
              <KanbanCard
                key={task.id} task={task} color={col.color}
                onComplete={onComplete} onUncomplete={onUncomplete} onEdit={onEdit}
              />
            ))}
          </>
        )}

        {pendingTasks.length === 0 && completedTasks.length === 0 && (
          <p className="text-[10px] text-gray-300 text-center py-6">Nothing here</p>
        )}
      </div>
    </div>
  )
}

/* ── KanbanView ───────────────────────────────────────────────────────────── */
export function KanbanView({ tasks, members, currentUserId, onComplete, onUncomplete, onEdit }: Props) {
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)

  const pending   = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')

  const columns: Column[] = []

  // Bounties column — only today's (matching TaskList strip logic)
  const todayBounties = pending.filter(t =>
    t.is_bounty && (!t.due_at || new Date(t.due_at) <= endOfToday)
  )
  if (todayBounties.length > 0) {
    columns.push({
      id: '__bounties',
      label: 'Daily Bounties',
      color: '#f59e0b',
      initial: '⚡',
      isBounty: true,
      tasks: todayBounties,
      totalPts: todayBounties.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  // Per-member columns
  for (const m of members) {
    const mine     = pending.filter(t => !t.is_bounty && t.assigned_to === m.id)
    const doneMine = completed
      .filter(t => (t.assigned_to === m.id || t.completed_by === m.id))
      .slice(0, 3)
    columns.push({
      id:       m.id,
      label:    m.name,
      color:    m.avatar_color,
      initial:  m.name[0].toUpperCase(),
      tasks:    [...mine, ...doneMine],
      totalPts: mine.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  // Unassigned column
  const unassigned = pending.filter(t => !t.is_bounty && !t.assigned_to)
  if (unassigned.length > 0) {
    columns.push({
      id:       '__unassigned',
      label:    'Unassigned',
      color:    '#94a3b8',
      initial:  '?',
      tasks:    unassigned,
      totalPts: unassigned.reduce((s, t) => s + t.point_bounty, 0),
    })
  }

  if (columns.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <p className="text-5xl mb-3">🎉</p>
        <p className="font-semibold text-gray-700">All clear!</p>
        <p className="text-sm text-gray-400 mt-1">Tap + to add a task</p>
      </div>
    )
  }

  const colProps = { currentUserId, onComplete, onUncomplete, onEdit }

  return (
    <>
      {/* ── Desktop: full-width grid, page scrolls ── */}
      <div
        className="hidden md:grid gap-4 px-4 pb-8 items-start"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(col => <KanbanColumn key={col.id} col={col} {...colProps} />)}
      </div>

      {/* ── Mobile: horizontal snap scroll ── */}
      <div
        className="md:hidden flex gap-3 overflow-x-auto pb-6 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {columns.map(col => (
          <div key={col.id} className="flex-none w-64 snap-start">
            <KanbanColumn col={col} {...colProps} />
          </div>
        ))}
      </div>
    </>
  )
}
