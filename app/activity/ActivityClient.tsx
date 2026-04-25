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
  initialMonth: string // YYYY-MM
}

function effectivePts(t: CompletedTask) {
  return t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// Returns array of [YYYY-MM-DD | null] representing a Mon-Sun calendar grid
function buildCalendarGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0)
  const offset   = (firstDay.getDay() + 6) % 7 // Mon = 0
  const grid: (string | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dd = String(d).padStart(2, '0')
    const mm = String(month).padStart(2, '0')
    grid.push(`${year}-${mm}-${dd}`)
  }
  // Pad to complete final row
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

function ownerOf(t: CompletedTask) {
  return t.completed_by ?? t.assigned_to
}

/* ── Day detail panel ─────────────────────────────────────────────────── */
function DayDetail({
  date,
  tasks,
  profiles,
  acting,
  onUndo,
  onShare,
}: {
  date: string
  tasks: CompletedTask[]
  profiles: Profile[]
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
}) {
  const profileMap = new Map(profiles.map(p => [p.id, p]))
  const d = new Date(`${date}T12:00:00`)
  const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  // Group by owner
  const byOwner = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    const ids: string[] = []
    if (t.is_shared) {
      if (t.completed_by) ids.push(t.completed_by)
      if (t.assigned_to && t.assigned_to !== t.completed_by) ids.push(t.assigned_to)
    } else {
      const id = ownerOf(t)
      if (id) ids.push(id)
    }
    if (ids.length === 0) ids.push('unknown')
    for (const id of ids) {
      if (!byOwner.has(id)) byOwner.set(id, [])
      byOwner.get(id)!.push(t)
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      {tasks.length === 0 && (
        <p className="text-xs text-gray-300 text-center py-6">Nothing completed</p>
      )}
      <div className="space-y-4">
        {[...byOwner.entries()].map(([ownerId, ownerTasks]) => {
          const p = profileMap.get(ownerId)
          const total = ownerTasks.reduce((s, t) => s + effectivePts(t), 0)
          return (
            <div key={ownerId}>
              {/* Person header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: p?.avatar_color ?? '#9ca3af' }}>
                  {p ? p.name[0].toUpperCase() : '?'}
                </div>
                <span className="text-xs font-semibold text-gray-700">{p?.name ?? 'Unknown'}</span>
                <span className="ml-auto text-xs font-bold text-amber-600">{total} pts</span>
              </div>

              {/* Task rows */}
              <div className="space-y-1.5 pl-9">
                {ownerTasks.map(t => (
                  <div key={`${ownerId}-${t.id}`}
                    className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
                    <p className="flex-1 text-xs text-gray-800 font-medium leading-snug truncate">{t.title}</p>
                    {t.is_shared && <span className="text-[10px] text-purple-400 font-medium shrink-0">shared</span>}
                    <div className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      t.is_bounty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {t.is_bounty
                        ? <Zap size={8} className="fill-amber-500 text-amber-500" />
                        : <CheckCircle2 size={8} />}
                      +{effectivePts(t)}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!t.is_shared && (
                        <button onClick={() => onShare(t.id)} disabled={!!acting[t.id]}
                          title="Mark as shared"
                          className="p-1 rounded text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
                          <Users size={11} className={acting[t.id] === 'share' ? 'animate-pulse' : ''} />
                        </button>
                      )}
                      <button onClick={() => onUndo(t.id)} disabled={!!acting[t.id]}
                        title="Undo"
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

/* ── Calendar grid ────────────────────────────────────────────────────── */
function CalendarGrid({
  year,
  month,
  tasks,
  profiles,
  selectedDate,
  onSelectDate,
}: {
  year: number
  month: number
  tasks: CompletedTask[]
  profiles: Profile[]
  selectedDate: string | null
  onSelectDate: (d: string) => void
}) {
  const grid = buildCalendarGrid(year, month)
  const today = new Date().toISOString().split('T')[0]

  // Group tasks by date
  const byDate = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    if (!t.completed_at) continue
    const d = t.completed_at.split('T')[0]
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(t)
  }

  // Unique owners for a day (for dots)
  function dayOwners(date: string): Profile[] {
    const dayTasks = byDate.get(date) ?? []
    const seen = new Set<string>()
    const result: Profile[] = []
    for (const t of dayTasks) {
      const ids = t.is_shared
        ? [t.completed_by, t.assigned_to].filter(Boolean) as string[]
        : [ownerOf(t)].filter(Boolean) as string[]
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id)
          const p = profiles.find(p => p.id === id)
          if (p) result.push(p)
        }
      }
    }
    return result
  }

  function dayTotal(date: string) {
    return (byDate.get(date) ?? []).reduce((s, t) => s + effectivePts(t), 0)
  }

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />

          const owners  = dayOwners(date)
          const total   = dayTotal(date)
          const isToday = date === today
          const isSel   = date === selectedDate
          const hasWork = total > 0

          return (
            <button
              key={date}
              onClick={() => onSelectDate(date)}
              className={`relative rounded-xl p-1 min-h-[52px] md:min-h-[64px] flex flex-col items-center transition-all
                ${isSel ? 'bg-indigo-600 text-white shadow-md' : hasWork ? 'bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50' : 'hover:bg-gray-100'}
                ${isToday && !isSel ? 'ring-2 ring-indigo-300' : ''}`}
            >
              <span className={`text-xs font-semibold mt-0.5 ${isSel ? 'text-white' : isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                {Number(date.split('-')[2])}
              </span>

              {hasWork && (
                <div className="flex flex-col items-center gap-0.5 mt-1">
                  {/* Person dots */}
                  <div className="flex gap-0.5 justify-center flex-wrap">
                    {owners.slice(0, 3).map(p => (
                      <div key={p.id} className={`w-2 h-2 rounded-full shrink-0 ${isSel ? 'opacity-90' : ''}`}
                        style={{ backgroundColor: isSel ? 'white' : p.avatar_color }} />
                    ))}
                  </div>
                  {/* Total pts */}
                  <span className={`text-[9px] font-bold leading-none ${isSel ? 'text-indigo-200' : 'text-amber-500'}`}>
                    {total}pt{total !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Root component ───────────────────────────────────────────────────── */
export function ActivityClient({ initialTasks, profiles, familyId, initialMonth }: Props) {
  const [yearMonth, setYearMonth] = useState(() => {
    const [y, m] = initialMonth.split('-').map(Number)
    return { year: y, month: m }
  })
  const [tasks,        setTasks]        = useState<CompletedTask[]>(initialTasks)
  const [loading,      setLoading]      = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    // Default to today if it's in the initial month
    const today = new Date().toISOString().split('T')[0]
    const [ty, tm] = today.split('-').map(Number)
    const [iy, im] = initialMonth.split('-').map(Number)
    return ty === iy && tm === im ? today : null
  })
  const [acting, setActing] = useState<Record<string, 'undo' | 'share'>>({})

  const supabase = createClient()

  const fetchMonth = useCallback(async (year: number, month: number) => {
    setLoading(true)
    const mm = String(month).padStart(2, '0')
    const res = await fetch(`/api/activity?month=${year}-${mm}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [])

  // Real-time: refresh current month on any task update
  useEffect(() => {
    const ch = supabase.channel('activity-cal-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `family_id=eq.${familyId}` }, () => fetchMonth(yearMonth.year, yearMonth.month))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchMonth, yearMonth])

  function prevMonth() {
    const { year, month } = yearMonth
    const newYear  = month === 1 ? year - 1 : year
    const newMonth = month === 1 ? 12 : month - 1
    setYearMonth({ year: newYear, month: newMonth })
    setSelectedDate(null)
    fetchMonth(newYear, newMonth)
  }

  function nextMonth() {
    const { year, month } = yearMonth
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) return // don't go future
    const newYear  = month === 12 ? year + 1 : year
    const newMonth = month === 12 ? 1 : month + 1
    setYearMonth({ year: newYear, month: newMonth })
    setSelectedDate(null)
    fetchMonth(newYear, newMonth)
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

  const { year, month } = yearMonth
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const selectedTasks = selectedDate
    ? tasks.filter(t => t.completed_at?.startsWith(selectedDate))
    : []

  // Monthly totals per person for the summary strip
  const profileMap = new Map(profiles.map(p => [p.id, p]))
  const monthTotals = profiles.map(p => {
    const pts = tasks
      .filter(t => {
        if (t.is_shared) return t.completed_by === p.id || t.assigned_to === p.id
        return (t.completed_by ?? t.assigned_to) === p.id
      })
      .reduce((s, t) => s + effectivePts(t), 0)
    return { profile: p, pts }
  }).filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts)

  const calendar = (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">{monthLabel(year, month)}</p>
          {loading && <p className="text-[10px] text-gray-400 mt-0.5">Loading…</p>}
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Monthly summary strip */}
      {monthTotals.length > 0 && (
        <div className="flex gap-2 mb-4 pb-4 border-b border-gray-50">
          {monthTotals.map(({ profile: p, pts }) => (
            <div key={p.id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: p.avatar_color }}>
                {p.name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-600 leading-none">{p.name}</p>
                <p className="text-[11px] font-bold text-amber-600 leading-none mt-0.5">{pts} pts</p>
              </div>
            </div>
          ))}
          {monthTotals.length === 0 && (
            <p className="text-xs text-gray-300">No activity this month</p>
          )}
        </div>
      )}

      <CalendarGrid
        year={year}
        month={month}
        tasks={tasks}
        profiles={profiles}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </div>
  )

  const detail = selectedDate ? (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <DayDetail
        date={selectedDate}
        tasks={selectedTasks}
        profiles={profiles}
        acting={acting}
        onUndo={handleUndo}
        onShare={handleShare}
      />
    </div>
  ) : (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-center min-h-[120px]">
      <p className="text-xs text-gray-300 text-center">Select a day to see details</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Activity</h1>

      {/* Mobile: stacked */}
      <div className="md:hidden space-y-4">
        {calendar}
        {detail}
      </div>

      {/* Desktop: calendar left, detail right */}
      <div className="hidden md:grid md:grid-cols-[1fr_360px] md:gap-6 md:items-start">
        {calendar}
        <div className="sticky top-4">
          {detail}
        </div>
      </div>
    </div>
  )
}
