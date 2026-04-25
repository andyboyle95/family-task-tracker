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
  initialWeekStart: string // YYYY-MM-DD (always a Monday, UTC)
}

function effectivePts(t: CompletedTask) {
  return t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty
}

// All date arithmetic in UTC to match completed_at UTC timestamps in DB
function utcDateStr(d: Date): string {
  const y  = d.getUTCFullYear()
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getWeekStart(date: Date): Date {
  const dow  = date.getUTCDay()
  const diff = (dow + 6) % 7 // Mon = 0
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
  const startDay = monday.getUTCDate()
  const endDay   = sunday.getUTCDate()
  const startMon = monday.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const endMon   = sunday.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  if (startMon === endMon) return `${startDay}–${endDay} ${startMon}`
  return `${startDay} ${startMon} – ${endDay} ${endMon}`
}

function taskBelongsToUser(t: CompletedTask, userId: string): boolean {
  if (t.is_shared) return t.completed_by === userId || t.assigned_to === userId
  return (t.completed_by ?? t.assigned_to) === userId
}

/* ── Task chip (desktop swimlane cell) ───────────────────────────────── */
function TaskChip({
  task,
  acting,
  onUndo,
  onShare,
}: {
  task: CompletedTask
  acting: 'undo' | 'share' | undefined
  onUndo: () => void
  onShare: () => void
}) {
  const pts = effectivePts(task)
  return (
    <div className={`group flex items-center gap-1 rounded-lg px-2 py-1 leading-tight
      ${task.is_bounty ? 'bg-amber-50 border border-amber-100' : 'bg-emerald-50 border border-emerald-100'}`}>
      <span className="flex-1 truncate text-[11px] font-medium text-gray-700 min-w-0">{task.title}</span>
      <span className={`shrink-0 flex items-center gap-0.5 text-[10px] font-bold
        ${task.is_bounty ? 'text-amber-600' : 'text-emerald-600'}`}>
        {task.is_bounty
          ? <Zap size={8} className="fill-amber-500 shrink-0" />
          : <CheckCircle2 size={8} className="shrink-0" />}
        +{pts}
      </span>
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

/* ── Desktop swimlane ─────────────────────────────────────────────────── */
function DesktopSwimlane({
  days,
  profiles,
  tasks,
  acting,
  onUndo,
  onShare,
}: {
  days: Date[]
  profiles: Profile[]
  tasks: CompletedTask[]
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
}) {
  const today = utcDateStr(new Date())

  const byDate = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    if (!t.completed_at) continue
    const d = t.completed_at.split('T')[0]
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(t)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th className="w-28 pb-3" />
            {days.map(d => {
              const ds      = utcDateStr(d)
              const isToday = ds === today
              return (
                <th key={ds} className="px-1.5 pb-3 text-center font-normal">
                  <div className="flex flex-col items-center">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide
                      ${isToday ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
                    </span>
                    <span className={`text-lg font-bold leading-tight
                      ${isToday ? 'text-indigo-600' : 'text-gray-800'}`}>
                      {d.getUTCDate()}
                    </span>
                  </div>
                </th>
              )
            })}
            <th className="w-16 pb-3 text-right pr-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Week</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {profiles.map((profile, pi) => {
            const weekTotal = tasks
              .filter(t => taskBelongsToUser(t, profile.id))
              .reduce((s, t) => s + effectivePts(t), 0)
            const isLast = pi === profiles.length - 1

            return (
              <tr key={profile.id}>
                {/* Person */}
                <td className={`pr-3 align-top ${isLast ? '' : 'pb-4'}`}>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: profile.avatar_color }}>
                      {profile.name[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 truncate">{profile.name}</span>
                  </div>
                </td>

                {/* Day cells */}
                {days.map(d => {
                  const ds      = utcDateStr(d)
                  const isToday = ds === today
                  const dayTasks = (byDate.get(ds) ?? []).filter(t => taskBelongsToUser(t, profile.id))
                  return (
                    <td key={ds} className={`px-1 align-top ${isLast ? '' : 'pb-4'}`}>
                      <div className={`min-h-[36px] rounded-xl p-1.5 space-y-1
                        ${isToday ? 'bg-indigo-50/70' : ''}`}>
                        {dayTasks.map(task => (
                          <TaskChip
                            key={task.id}
                            task={task}
                            acting={acting[task.id]}
                            onUndo={() => onUndo(task.id)}
                            onShare={() => onShare(task.id)}
                          />
                        ))}
                      </div>
                    </td>
                  )
                })}

                {/* Week total */}
                <td className={`pl-2 align-top text-right ${isLast ? '' : 'pb-4'}`}>
                  {weekTotal > 0
                    ? <><span className="text-sm font-bold text-amber-600">{weekTotal}</span>
                        <span className="text-[10px] text-gray-400 ml-0.5">pts</span></>
                    : <span className="text-sm text-gray-200">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Mobile: day-picker strip + person-grouped tasks ─────────────────── */
function MobileDayView({
  days,
  profiles,
  tasks,
  selectedDay,
  onSelectDay,
  acting,
  onUndo,
  onShare,
}: {
  days: Date[]
  profiles: Profile[]
  tasks: CompletedTask[]
  selectedDay: string
  onSelectDay: (d: string) => void
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
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
      {/* Day picker */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {days.map(d => {
          const ds      = utcDateStr(d)
          const isToday = ds === today
          const isSel   = ds === selectedDay
          const hasWork = (byDate.get(ds) ?? []).length > 0
          return (
            <button key={ds} onClick={() => onSelectDay(ds)}
              className={`flex flex-col items-center px-3 py-2 rounded-2xl shrink-0 transition-all
                ${isSel
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isToday
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  : 'bg-white border border-gray-100 text-gray-600'}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="text-xl font-bold leading-tight">{d.getUTCDate()}</span>
              <div className={`w-1.5 h-1.5 rounded-full mt-0.5 transition-colors
                ${hasWork
                  ? isSel ? 'bg-white/70' : 'bg-amber-400'
                  : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      {/* Tasks */}
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
                <span className="ml-auto text-xs font-bold text-amber-600">{total} pts</span>
              </div>
              <div className="space-y-1.5 pl-9">
                {personTasks.map(t => (
                  <div key={t.id}
                    className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
                    <p className="flex-1 text-xs text-gray-800 font-medium leading-snug">{t.title}</p>
                    {t.is_shared && (
                      <span className="text-[10px] text-purple-400 font-medium shrink-0">shared</span>
                    )}
                    <div className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                      ${t.is_bounty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {t.is_bounty
                        ? <Zap size={8} className="fill-amber-500" />
                        : <CheckCircle2 size={8} />}
                      +{effectivePts(t)}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!t.is_shared && (
                        <button onClick={() => onShare(t.id)} disabled={!!acting[t.id]}
                          className="p-1 rounded text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
                          <Users size={11} />
                        </button>
                      )}
                      <button onClick={() => onUndo(t.id)} disabled={!!acting[t.id]}
                        className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40">
                        <RotateCcw size={11} className={acting[t.id] === 'undo' ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
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
    // Default to today if it falls in this week, else last day of week
    const today   = utcDateStr(new Date())
    const weekEnd = new Date(`${initialWeekStart}T00:00:00Z`)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
    return today >= initialWeekStart && today <= utcDateStr(weekEnd) ? today : utcDateStr(weekEnd)
  })

  const supabase = createClient()
  const days     = getWeekDays(monday)

  const fetchWeek = useCallback(async (mon: Date) => {
    setLoading(true)
    const from = utcDateStr(mon)
    const toDate = new Date(mon)
    toDate.setUTCDate(toDate.getUTCDate() + 7)
    const to = utcDateStr(toDate)
    const res = await fetch(`/api/activity?from=${from}&to=${to}`)
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
    const currentWeekMonday = getWeekStart(new Date())
    if (utcDateStr(monday) >= utcDateStr(currentWeekMonday)) return
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

  const currentWeekMonday  = getWeekStart(new Date())
  const isCurrentWeek      = utcDateStr(monday) === utcDateStr(currentWeekMonday)

  // Per-person week totals for the summary strip
  const weekTotals = profiles
    .map(p => ({
      profile: p,
      pts: tasks.filter(t => taskBelongsToUser(t, p.id)).reduce((s, t) => s + effectivePts(t), 0),
    }))
    .filter(x => x.pts > 0)
    .sort((a, b) => b.pts - a.pts)

  return (
    <div>
      {/* Page header + week navigation */}
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

      {/* Per-person week summary */}
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
              <span className="text-xs font-bold text-amber-600">{pts} pts this week</span>
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
        />
      </div>
    </div>
  )
}
