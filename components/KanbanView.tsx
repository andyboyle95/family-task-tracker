'use client'

import { useState, useRef } from 'react'
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
  onUpdate: (id: string, patch: { title?: string; point_bounty?: number }) => Promise<void>
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
  task, color, onComplete, onUncomplete, onEdit, onUpdate,
}: {
  task: Task; color: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
  onUpdate: (id: string, patch: { title?: string; point_bounty?: number }) => Promise<void>
}) {
  const [loading, setLoading]         = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingPts, setEditingPts]     = useState(false)
  const [draftTitle, setDraftTitle]   = useState(task.title)
  const [draftPts, setDraftPts]       = useState(task.point_bounty)
  const titleRef = useRef<HTMLInputElement>(null)
  const ptsRef   = useRef<HTMLInputElement>(null)

  const done = task.status === 'completed'
  const due  = task.due_at ? dueBadge(task.due_at, done) : null

  async function handleAction() {
    setLoading(true)
    await (done ? onUncomplete(task.id) : onComplete(task.id))
    setLoading(false)
  }

  function startEditTitle() {
    if (done) return
    setDraftTitle(task.title)
    setEditingTitle(true)
    setTimeout(() => titleRef.current?.select(), 0)
  }

  async function commitTitle() {
    setEditingTitle(false)
    if (draftTitle.trim() && draftTitle.trim() !== task.title) {
      await onUpdate(task.id, { title: draftTitle.trim() })
    }
  }

  function startEditPts() {
    if (done) return
    setDraftPts(task.point_bounty)
    setEditingPts(true)
    setTimeout(() => ptsRef.current?.select(), 0)
  }

  async function commitPts() {
    setEditingPts(false)
    const pts = Math.max(1, draftPts)
    if (pts !== task.point_bounty) {
      await onUpdate(task.id, { point_bounty: pts })
    }
  }

  return (
    <div
      className={`group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-150 ${done ? 'opacity-50' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Title — click to edit inline */}
      <div className="px-2.5 pt-2 pb-0.5">
        {editingTitle ? (
          <input
            ref={titleRef}
            autoFocus
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') { setEditingTitle(false); setDraftTitle(task.title) }
            }}
            className="w-full text-[12px] font-medium text-gray-800 bg-indigo-50 border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 leading-snug"
          />
        ) : (
          <div className="relative">
            <p
              title={done ? '' : 'Click to edit'}
              onClick={startEditTitle}
              className={`text-[12px] font-medium leading-snug line-clamp-2 ${
                done
                  ? 'line-through text-gray-400'
                  : 'text-gray-800 cursor-text group-hover:text-indigo-700 group-hover:underline decoration-indigo-200'
              }`}
            >
              {task.title}
            </p>
            {!done && (
              <Pencil size={7} className="absolute top-0 -right-0.5 opacity-0 group-hover:opacity-40 text-indigo-400 transition-opacity" />
            )}
          </div>
        )}
      </div>

      {/* Badges row */}
      <div className="px-2.5 pb-1 flex items-center gap-1 mt-1 flex-wrap">
        {/* Points badge — click to edit */}
        {editingPts ? (
          <span className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-300 rounded-full px-1.5 py-0.5">
            {task.is_bounty && <Zap size={8} className="fill-amber-500 text-amber-500" />}
            <input
              ref={ptsRef}
              autoFocus
              type="number"
              min={1} max={999}
              value={draftPts}
              onChange={e => setDraftPts(parseInt(e.target.value) || 1)}
              onBlur={commitPts}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitPts() }
                if (e.key === 'Escape') { setEditingPts(false) }
              }}
              className="w-8 text-[10px] font-bold text-amber-700 bg-transparent focus:outline-none text-center"
            />
            <span className="text-[10px] text-amber-600">pt</span>
          </span>
        ) : (
          <span
            title={done ? '' : 'Click to edit points'}
            onClick={startEditPts}
            className={`inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-100 ${
              done ? '' : 'cursor-pointer hover:border-amber-400 hover:bg-amber-100'
            }`}
          >
            {task.is_bounty && <Zap size={8} className="fill-amber-500 text-amber-500" />}
            {task.point_bounty}pt
            {!done && <Pencil size={6} className="opacity-0 group-hover:opacity-50 text-amber-600 ml-0.5 transition-opacity" />}
          </span>
        )}

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

      {/* Actions — hover-only on mobile, always on desktop */}
      <div className="flex justify-end items-center gap-0.5 px-1.5 pb-1 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
        {!done && (
          <button
            onClick={() => onEdit(task)}
            title="Open full editor"
            className="p-1 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <Pencil size={11} />
          </button>
        )}
        <button
          onClick={handleAction}
          disabled={loading}
          className={`p-1 rounded-lg transition-colors ${
            done
              ? 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'
              : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50'
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
  col, currentUserId, onComplete, onUncomplete, onEdit, onUpdate,
}: {
  col: Column
  currentUserId: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
  onUpdate: (id: string, patch: { title?: string; point_bounty?: number }) => Promise<void>
}) {
  const pendingTasks   = col.tasks.filter(t => t.status === 'pending')
  const completedTasks = col.tasks.filter(t => t.status === 'completed')
  const isMe = col.id === currentUserId

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ boxShadow: `0 2px 16px 0 ${col.color}18` }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex flex-col gap-1 shrink-0"
        style={{
          background: `linear-gradient(135deg, ${col.color}22 0%, ${col.color}08 100%)`,
          borderTop: `3px solid ${col.color}`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {col.isBounty ? (
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${col.color}25` }}>
                <Zap size={12} className="fill-amber-500 text-amber-500" />
              </div>
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0"
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
            className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0"
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

      {/* Cards — no max-height, page scrolls naturally */}
      <div className="bg-gray-50/60 px-1.5 pt-1.5 pb-2 space-y-1.5">
        {pendingTasks.map(task => (
          <KanbanCard
            key={task.id} task={task} color={col.color}
            onComplete={onComplete} onUncomplete={onUncomplete}
            onEdit={onEdit} onUpdate={onUpdate}
          />
        ))}

        {completedTasks.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Done</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            {completedTasks.map(task => (
              <KanbanCard
                key={task.id} task={task} color={col.color}
                onComplete={onComplete} onUncomplete={onUncomplete}
                onEdit={onEdit} onUpdate={onUpdate}
              />
            ))}
          </>
        )}

        {pendingTasks.length === 0 && completedTasks.length === 0 && (
          <p className="text-[10px] text-gray-300 text-center py-5">Nothing here</p>
        )}
      </div>
    </div>
  )
}

/* ── KanbanView ───────────────────────────────────────────────────────────── */
export function KanbanView({ tasks, members, currentUserId, onComplete, onUncomplete, onEdit, onUpdate }: Props) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const [activeCol, setActiveCol] = useState(0)

  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)

  const pending   = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')

  const columns: Column[] = []

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

  function handleScroll() {
    if (!scrollRef.current) return
    const itemWidth = 256 + 12 // w-64 + gap-3
    setActiveCol(Math.min(columns.length - 1, Math.round(scrollRef.current.scrollLeft / itemWidth)))
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

  const colProps = { currentUserId, onComplete, onUncomplete, onEdit, onUpdate }

  return (
    <>
      {/* Desktop: full-width grid */}
      <div
        className="hidden md:grid gap-4 px-4 pb-8 items-start"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map(col => <KanbanColumn key={col.id} col={col} {...colProps} />)}
      </div>

      {/* Mobile: horizontal snap scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="md:hidden flex gap-3 overflow-x-auto pb-3 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {columns.map(col => (
          <div key={col.id} className="flex-none w-64 snap-start">
            <KanbanColumn col={col} {...colProps} />
          </div>
        ))}
      </div>

      {/* Mobile: column position dots */}
      {columns.length > 1 && (
        <div className="md:hidden flex justify-center items-center gap-1.5 pb-4">
          {columns.map((col, i) => (
            <div
              key={col.id}
              className={`rounded-full transition-all duration-200 ${i === activeCol ? 'w-5 h-2' : 'w-2 h-2'}`}
              style={{ backgroundColor: i === activeCol ? col.color : col.color + '44' }}
            />
          ))}
        </div>
      )}
    </>
  )
}
