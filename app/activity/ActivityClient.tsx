'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Zap, CheckCircle2, RotateCcw, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

interface CompletedTask {
  id: string
  title: string
  point_bounty: number
  is_bounty: boolean
  is_shared: boolean
  completed_at: string | null
  completed_by: string | null
  assigned_to: string | null
  family_id: string
}

interface Props {
  initialTasks: CompletedTask[]
  profiles: Profile[]
  familyId: string
  initialWeekStart: string // YYYY-MM-DD (Monday, UTC)
}

function effectivePts(t: CompletedTask) {
  return t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty
}

function utcDateStr(d: Date): string {
  const y  = d.getUTCFullYear()
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getWeekStart(date: Date): Date {
  const diff = (date.getUTCDay() + 6) % 7
  const d    = new Date(date)
  d.setUTCDate(d.getUTCDate() - diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
}

function weekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  const startMon = monday.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const endMon   = sunday.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  if (startMon === endMon) {
    return `${monday.getUTCDate()}–${sunday.getUTCDate()} ${startMon}`
  }
  return `${monday.getUTCDate()} ${startMon} – ${sunday.getUTCDate()} ${endMon}`
}

function taskBelongsToUser(t: CompletedTask, userId: string): boolean {
  if (t.is_shared) return t.completed_by === userId || t.assigned_to === userId
  return (t.completed_by ?? t.assigned_to) === userId
}

// Hex color → rgba with opacity
function colorWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

/* ── Task chip ────────────────────────────────────────────────────────── */
function TaskChip({
  task,
  color,
  acting,
  onUndo,
  onShare,
  onEditPts,
}: {
  task: CompletedTask
  color: string
  acting: 'undo' | 'share' | undefined
  onUndo: () => void
  onShare: () => void
  onEditPts: (newBounty: number) => Promise<void>
}) {
  const [editingPts, setEditingPts] = useState(false)
  const [draftPts,   setDraftPts]   = useState('')
  const pts = effectivePts(task)

  function startEditPts(e: React.MouseEvent) {
    e.stopPropagation()
    setDraftPts(String(pts))
    setEditingPts(true)
  }

  async function commitPts() {
    setEditingPts(false)
    const newEffective = parseInt(draftPts, 10)
    if (isNaN(newEffective) || newEffective < 0 || newEffective === pts) return
    // Convert displayed effective value back to point_bounty
    await onEditPts(task.is_shared ? newEffective * 2 : newEffective)
  }

  return (
    <div
      className="group flex items-center gap-1 rounded-lg px-2 py-1 leading-tight"
      style={{
        backgroundColor: colorWithOpacity(color, 0.1),
        border: `1px solid ${colorWithOpacity(color, 0.25)}`,
      }}
    >
      {task.is_bounty
        ? <Zap size={8} className="shrink-0" style={{ color, fill: color }} />
        : <CheckCircle2 size={8} className="shrink-0" style={{ color }} />}
      <span className="flex-1 truncate text-[11px] font-medium text-gray-700 min-w-0">{task.title}</span>

      {editingPts ? (
        <input
          type="number"
          value={draftPts}
          min={0}
          autoFocus
          onChange={e => setDraftPts(e.target.value)}
          onBlur={commitPts}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitPts() }
            if (e.key === 'Escape') setEditingPts(false)
          }}
          className="w-8 text-[10px] font-bold text-right bg-transparent border-b outline-none"
          style={{ color, borderColor: colorWithOpacity(color, 0.5) }}
        />
      ) : (
        <button onClick={startEditPts}
          className="shrink-0 text-[10px] font-bold hover:underline cursor-pointer"
          style={{ color }}
          title="Click to edit points">
          +{pts}
        </button>
      )}

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {!task.is_shared && (
          <button onClick={onShare} disabled={!!acting}
            className="p-0.5 rounded text-gray-300 hover:text-purple-500 transition-colors disabled:opacity-40">
            <Users size={9} />
          </button>
        )}
        <button onClick={onUndo} disabled={!!acting}
          className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40">
          <RotateCcw size={9} className={acting === 'undo' ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

/* ── Desktop swimlane — CSS grid, no scrollbar ────────────────────────── */
function DesktopSwimlane({
  days,
  profiles,
  tasks,
  acting,
  onUndo,
  onShare,
  onEditPts,
}: {
  days: Date[]
  profiles: Profile[]
  tasks: CompletedTask[]
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
  onEditPts: (id: string, newBounty: number) => Promise<void>
}) {
  const today  = utcDateStr(new Date())
  const nCols  = profiles.length > 0 ? 7 : 7
  // person label | 7 day cols | week total
  const gridCols = `minmax(80px,auto) repeat(${nCols},1fr) minmax(48px,auto)`

  const byDate = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    if (!t.completed_at) continue
    const d = t.completed_at.split('T')[0]
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(t)
  }

  return (
    <div className="grid gap-x-2" style={{ gridTemplateColumns: gridCols }}>
      {/* ── Header row ── */}
      <div /> {/* person col */}
      {days.map(d => {
        const ds      = utcDateStr(d)
        const isToday = ds === today
        return (
          <div key={ds} className="pb-3 text-center">
            <p className={`text-[10px] font-semibold uppercase tracking-wide
              ${isToday ? 'text-indigo-500' : 'text-gray-400'}`}>
              {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
            </p>
            <p className={`text-lg font-bold leading-tight
              ${isToday ? 'text-indigo-600' : 'text-gray-800'}`}>
              {d.getUTCDate()}
            </p>
          </div>
        )
      })}
      <div className="pb-3 text-right pr-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Week</span>
      </div>

      {/* ── Person rows ── */}
      {profiles.map((profile, pi) => {
        const isLast    = pi === profiles.length - 1
        const weekTotal = tasks
          .filter(t => taskBelongsToUser(t, profile.id))
          .reduce((s, t) => s + effectivePts(t), 0)

        return (
          <>
            {/* Person label */}
            <div key={`person-${profile.id}`}
              className={`flex items-start gap-2 pr-3 pt-1 ${isLast ? '' : 'pb-5'}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: profile.avatar_color }}>
                {profile.name[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-700 truncate pt-1">{profile.name}</span>
            </div>

            {/* Day cells */}
            {days.map(d => {
              const ds       = utcDateStr(d)
              const isToday  = ds === today
              const dayTasks = (byDate.get(ds) ?? []).filter(t => taskBelongsToUser(t, profile.id))
              return (
                <div key={`${profile.id}-${ds}`}
                  className={`px-1 ${isLast ? '' : 'pb-5'}`}>
                  <div className={`min-h-[32px] rounded-xl p-1.5 space-y-1
                    ${isToday ? 'bg-indigo-50/60' : ''}`}>
                    {dayTasks.map(task => (
                      <TaskChip
                        key={task.id}
                        task={task}
                        color={profile.avatar_color}
                        acting={acting[task.id]}
                        onUndo={() => onUndo(task.id)}
                        onShare={() => onShare(task.id)}
                        onEditPts={newBounty => onEditPts(task.id, newBounty)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Week total */}
            <div key={`total-${profile.id}`}
              className={`pl-2 pt-1 text-right ${isLast ? '' : 'pb-5'}`}>
              {weekTotal > 0
                ? <><span className="text-sm font-bold" style={{ color: profile.avatar_color }}>{weekTotal}</span>
                    <span className="text-[10px] text-gray-400 ml-0.5">pts</span></>
                : <span className="text-sm text-gray-200">—</span>}
            </div>
          </>
        )
      })}
    </div>
  )
}

/* ── Mobile task card (extracted so it can hold its own editing state) ── */
function MobileTaskCard({
  task,
  color,
  acting,
  onUndo,
  onShare,
  onEditPts,
}: {
  task: CompletedTask
  color: string
  acting: 'undo' | 'share' | undefined
  onUndo: () => void
  onShare: () => void
  onEditPts: (newBounty: number) => Promise<void>
}) {
  const [editingPts, setEditingPts] = useState(false)
  const [draftPts,   setDraftPts]   = useState('')
  const pts = effectivePts(task)

  function startEditPts() {
    setDraftPts(String(pts))
    setEditingPts(true)
  }

  async function commitPts() {
    setEditingPts(false)
    const newEffective = parseInt(draftPts, 10)
    if (isNaN(newEffective) || newEffective < 0 || newEffective === pts) return
    await onEditPts(task.is_shared ? newEffective * 2 : newEffective)
  }

  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{
        backgroundColor: colorWithOpacity(color, 0.08),
        border: `1px solid ${colorWithOpacity(color, 0.2)}`,
      }}>
      <p className="flex-1 text-xs text-gray-800 font-medium leading-snug">{task.title}</p>
      {task.is_shared && (
        <span className="text-[10px] text-purple-400 font-medium shrink-0">shared</span>
      )}

      {/* Editable points badge */}
      <div className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
        style={{
          backgroundColor: colorWithOpacity(color, 0.12),
          color,
        }}>
        {task.is_bounty
          ? <Zap size={8} style={{ fill: color, color }} />
          : <CheckCircle2 size={8} style={{ color }} />}
        {editingPts ? (
          <input
            type="number"
            value={draftPts}
            min={0}
            autoFocus
            onChange={e => setDraftPts(e.target.value)}
            onBlur={commitPts}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitPts() }
              if (e.key === 'Escape') setEditingPts(false)
            }}
            className="w-8 bg-transparent text-[10px] font-bold outline-none text-right border-b"
            style={{ color, borderColor: colorWithOpacity(color, 0.5) }}
          />
        ) : (
          <button onClick={startEditPts} className="hover:underline" title="Tap to edit points">
            +{pts}
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!task.is_shared && (
          <button onClick={onShare} disabled={!!acting}
            className="p-1 rounded text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
            <Users size={11} />
          </button>
        )}
        <button onClick={onUndo} disabled={!!acting}
          className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40">
          <RotateCcw size={11} className={acting === 'undo' ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

/* ── Mobile: day-picker strip + person-grouped list ──────────────────── */
function MobileDayView({
  days,
  profiles,
  tasks,
  selectedDay,
  onSelectDay,
  acting,
  onUndo,
  onShare,
  onEditPts,
}: {
  days: Date[]
  profiles: Profile[]
  tasks: CompletedTask[]
  selectedDay: string
  onSelectDay: (d: string) => void
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
  onEditPts: (id: string, newBounty: number) => Promise<void>
}) {
  const today = utcDateStr(new Date())

  const byDate = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    if (!t.completed_at) continue
    const d = t.completed_at.split('T')[0]
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(t)
  }

  const dayTasks = byDate.get(selectedDay) ?? []
  const byPerson = profiles
    .map(p => ({ profile: p, tasks: dayTasks.filter(t => taskBelongsToUser(t, p.id)) }))
    .filter(x => x.tasks.length > 0)

  return (
    <div>
      {/* Day picker — always fits 7 days, no scroll */}
      <div className="grid grid-cols-7 gap-1 mb-5">
        {days.map(d => {
          const ds      = utcDateStr(d)
          const isToday = ds === today
          const isSel   = ds === selectedDay
          const hasWork = (byDate.get(ds) ?? []).length > 0
          return (
            <button key={ds} onClick={() => onSelectDay(ds)}
              className={`flex flex-col items-center py-2 rounded-2xl transition-all
                ${isSel
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isToday
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  : 'bg-white border border-gray-100 text-gray-600'}`}>
              <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="text-base font-bold leading-tight mt-0.5">{d.getUTCDate()}</span>
              <div className={`w-1.5 h-1.5 rounded-full mt-1 transition-colors
                ${hasWork ? (isSel ? 'bg-white/70' : 'bg-amber-400') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      {/* Tasks grouped by person */}
      <div className="space-y-4">
        {byPerson.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <p className="text-3xl mb-2">🛋️</p>
            <p className="text-sm text-gray-400">Nothing completed</p>
          </div>
        )}
        {byPerson.map(({ profile, tasks: personTasks }) => {
          const total = personTasks.reduce((s, t) => s + effectivePts(t), 0)
          return (
            <div key={profile.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: profile.avatar_color }}>
                  {profile.name[0].toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-gray-800">{profile.name}</span>
                <span className="ml-auto text-xs font-bold" style={{ color: profile.avatar_color }}>
                  {total} pts
                </span>
              </div>
              <div className="space-y-1.5 pl-9">
                {personTasks.map(t => (
                  <MobileTaskCard
                    key={t.id}
                    task={t}
                    color={profile.avatar_color}
                    acting={acting[t.id]}
                    onUndo={() => onUndo(t.id)}
                    onShare={() => onShare(t.id)}
                    onEditPts={newBounty => onEditPts(t.id, newBounty)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Root component ───────────────────────────────────────────────────── */
export function ActivityClient({ initialTasks, profiles, familyId, initialWeekStart }: Props) {
  const [monday,      setMonday]      = useState(() => new Date(`${initialWeekStart}T00:00:00Z`))
  const [tasks,       setTasks]       = useState<CompletedTask[]>(initialTasks)
  const [loading,     setLoading]     = useState(false)
  const [acting,      setActing]      = useState<Record<string, 'undo' | 'share'>>({})
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const today   = utcDateStr(new Date())
    const weekEnd = new Date(`${initialWeekStart}T00:00:00Z`)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
    return today >= initialWeekStart && today <= utcDateStr(weekEnd) ? today : utcDateStr(weekEnd)
  })

  const supabase = createClient()
  const days     = getWeekDays(monday)

  const fetchWeek = useCallback(async (mon: Date) => {
    setLoading(true)
    const from   = utcDateStr(mon)
    const toDate = new Date(mon)
    toDate.setUTCDate(toDate.getUTCDate() + 7)
    const res = await fetch(`/api/activity?from=${from}&to=${utcDateStr(toDate)}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    const ch = supabase.channel('activity-swim-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `family_id=eq.${familyId}` }, () => fetchWeek(monday))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchWeek, monday])

  function prevWeek() {
    const prev = new Date(monday)
    prev.setUTCDate(prev.getUTCDate() - 7)
    setMonday(prev)
    const lastDay = new Date(prev)
    lastDay.setUTCDate(lastDay.getUTCDate() + 6)
    setSelectedDay(utcDateStr(lastDay))
    fetchWeek(prev)
  }

  function nextWeek() {
    const currentMonday = getWeekStart(new Date())
    if (utcDateStr(monday) >= utcDateStr(currentMonday)) return
    const next = new Date(monday)
    next.setUTCDate(next.getUTCDate() + 7)
    setMonday(next)
    setSelectedDay(utcDateStr(next))
    fetchWeek(next)
  }

  async function handleUndo(taskId: string) {
    setActing(prev => ({ ...prev, [taskId]: 'undo' }))
    const res = await fetch(`/api/tasks/${taskId}/uncomplete`, { method: 'POST' })
    if (res.ok) setTasks(prev => prev.filter(t => t.id !== taskId))
    setActing(prev => { const n = { ...prev }; delete n[taskId]; return n })
  }

  async function handleShare(taskId: string) {
    setActing(prev => ({ ...prev, [taskId]: 'share' }))
    const res = await fetch(`/api/tasks/${taskId}/share`, { method: 'POST' })
    if (res.ok) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_shared: true } : t))
    setActing(prev => { const n = { ...prev }; delete n[taskId]; return n })
  }

  async function handleEditPts(taskId: string, newBounty: number) {
    const res = await fetch(`/api/tasks/${taskId}/points`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point_bounty: newBounty }),
    })
    if (res.ok) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, point_bounty: newBounty } : t))
  }

  const isCurrentWeek = utcDateStr(monday) === utcDateStr(getWeekStart(new Date()))

  const weekTotals = profiles
    .map(p => ({
      profile: p,
      pts: tasks.filter(t => taskBelongsToUser(t, p.id)).reduce((s, t) => s + effectivePts(t), 0),
    }))
    .filter(x => x.pts > 0)
    .sort((a, b) => b.pts - a.pts)

  return (
    <div>
      {/* Header + navigation */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Activity</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white border border-gray-200 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[110px]">
            <p className="text-sm font-semibold text-gray-700">{weekLabel(monday)}</p>
            {loading && <p className="text-[10px] text-indigo-400 mt-0.5">Loading…</p>}
          </div>
          <button onClick={nextWeek} disabled={isCurrentWeek}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white border border-gray-200 transition-colors disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week summary strip */}
      {weekTotals.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {weekTotals.map(({ profile, pts }) => (
            <div key={profile.id}
              className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                style={{ backgroundColor: profile.avatar_color }}>
                {profile.name[0].toUpperCase()}
              </div>
              <span className="text-xs font-medium text-gray-600">{profile.name}</span>
              <span className="text-xs font-bold" style={{ color: profile.avatar_color }}>{pts} pts this week</span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop swimlane */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-100 p-5">
        <DesktopSwimlane
          days={days}
          profiles={profiles}
          tasks={tasks}
          acting={acting}
          onUndo={handleUndo}
          onShare={handleShare}
          onEditPts={handleEditPts}
        />
      </div>

      {/* Mobile day-picker */}
      <div className="md:hidden">
        <MobileDayView
          days={days}
          profiles={profiles}
          tasks={tasks}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          acting={acting}
          onUndo={handleUndo}
          onShare={handleShare}
          onEditPts={handleEditPts}
        />
      </div>
    </div>
  )
}
