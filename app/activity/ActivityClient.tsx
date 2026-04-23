'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, CheckCircle2, RotateCcw, Users } from 'lucide-react'
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
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function groupByDay(tasks: CompletedTask[]): { label: string; tasks: CompletedTask[] }[] {
  const groups = new Map<string, CompletedTask[]>()
  for (const t of tasks) {
    if (!t.completed_at) continue
    const d = new Date(t.completed_at)
    const today     = new Date()
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    let label: string
    if (d.toDateString() === today.toDateString())          label = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    else label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(t)
  }
  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }))
}

function effectivePts(t: CompletedTask) {
  return t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty
}

function TaskRow({
  task,
  completer,
  isActing,
  onUndo,
  onShare,
}: {
  task: CompletedTask
  completer: Profile | undefined
  isActing: 'undo' | 'share' | undefined
  onUndo: () => void
  onShare: () => void
}) {
  const pts = effectivePts(task)
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug font-medium truncate">{task.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {task.completed_at ? relativeTime(task.completed_at) : ''}
          {task.is_shared && <span className="ml-1.5 text-purple-400 font-medium">· shared</span>}
        </p>
      </div>

      <div className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
        task.is_bounty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}>
        {task.is_bounty
          ? <Zap size={10} className="fill-amber-500 text-amber-500" />
          : <CheckCircle2 size={10} />}
        +{pts}
        {task.is_shared && <span className="ml-0.5 text-purple-500">÷2</span>}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!task.is_shared && (
          <button onClick={onShare} disabled={!!isActing}
            title="Mark as shared — halves the points"
            className="p-1.5 rounded-lg text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
            <Users size={13} className={isActing === 'share' ? 'animate-pulse' : ''} />
          </button>
        )}
        <button onClick={onUndo} disabled={!!isActing}
          title="Undo — reverses points"
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40">
          <RotateCcw size={13} className={isActing === 'undo' ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

/* ── Desktop: column per owner ────────────────────────────────────────── */
function DesktopColumns({
  tasks,
  profiles,
  profileMap,
  acting,
  onUndo,
  onShare,
}: {
  tasks: CompletedTask[]
  profiles: Profile[]
  profileMap: Map<string, Profile>
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
}) {
  const columns = profiles.map(p => ({
    profile: p,
    tasks: tasks.filter(t => (t.completed_by ?? t.assigned_to) === p.id),
  }))

  const unknownTasks = tasks.filter(t => {
    const id = t.completed_by ?? t.assigned_to
    return !id || !profileMap.has(id)
  })

  const allCols = [
    ...columns,
    ...(unknownTasks.length > 0 ? [{ profile: null as Profile | null, tasks: unknownTasks }] : []),
  ]

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${allCols.length}, minmax(0, 1fr))` }}
    >
      {allCols.map(col => {
        const p     = col.profile
        const total = col.tasks.reduce((s, t) => s + effectivePts(t), 0)
        return (
          <div key={p?.id ?? 'unknown'} className="flex flex-col gap-3">
            {/* Column header */}
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2.5"
              style={p ? { borderTopWidth: 3, borderTopColor: p.avatar_color } : undefined}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: p?.avatar_color ?? '#9ca3af' }}>
                {p ? p.name[0].toUpperCase() : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p?.name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-400">{col.tasks.length} tasks · {total.toLocaleString()} pts</p>
              </div>
            </div>

            {/* Task cards */}
            <div className="space-y-2">
              {col.tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  completer={p ?? undefined}
                  isActing={acting[task.id]}
                  onUndo={() => onUndo(task.id)}
                  onShare={() => onShare(task.id)}
                />
              ))}
              {col.tasks.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-6">No activity</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Mobile: timeline grouped by day ─────────────────────────────────── */
function MobileTimeline({
  tasks,
  profileMap,
  acting,
  onUndo,
  onShare,
}: {
  tasks: CompletedTask[]
  profileMap: Map<string, Profile>
  acting: Record<string, 'undo' | 'share'>
  onUndo: (id: string) => void
  onShare: (id: string) => void
}) {
  const groups = groupByDay(tasks)

  return (
    <div className="space-y-6">
      {groups.map(({ label, tasks: dayTasks }) => (
        <section key={label}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</p>
          <div className="space-y-2">
            {dayTasks.map(task => {
              const completerId = task.completed_by ?? task.assigned_to
              const completer   = completerId ? profileMap.get(completerId) : undefined
              return (
                <div key={task.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: completer?.avatar_color ?? '#6366f1' }}>
                    {completer ? completer.name[0].toUpperCase() : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">
                      <span className="font-semibold">{completer?.name ?? 'Someone'}</span>
                      {' '}{task.is_bounty ? 'claimed' : 'completed'}{' '}
                      <span className="font-medium text-gray-900">{task.title}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {task.completed_at ? relativeTime(task.completed_at) : ''}
                      {task.is_shared && <span className="ml-1.5 text-purple-400 font-medium">· shared</span>}
                    </p>
                  </div>
                  <div className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                    task.is_bounty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {task.is_bounty
                      ? <Zap size={10} className="fill-amber-500 text-amber-500" />
                      : <CheckCircle2 size={10} />}
                    +{effectivePts(task)}
                    {task.is_shared && <span className="ml-0.5 text-purple-500">÷2</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!task.is_shared && (
                      <button onClick={() => onShare(task.id)} disabled={!!acting[task.id]}
                        title="Mark as shared — halves the points"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-40">
                        <Users size={14} className={acting[task.id] === 'share' ? 'animate-pulse' : ''} />
                      </button>
                    )}
                    <button onClick={() => onUndo(task.id)} disabled={!!acting[task.id]}
                      title="Undo — reverses points"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40">
                      <RotateCcw size={14} className={acting[task.id] === 'undo' ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/* ── Root component ───────────────────────────────────────────────────── */
export function ActivityClient({ initialTasks, profiles, familyId }: Props) {
  const [tasks,  setTasks]  = useState<CompletedTask[]>(initialTasks)
  const [acting, setActing] = useState<Record<string, 'undo' | 'share'>>({})
  const supabase = createClient()
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  const fetchActivity = useCallback(async () => {
    const res = await fetch('/api/activity')
    if (res.ok) setTasks(await res.json())
  }, [])

  useEffect(() => {
    const ch = supabase.channel('activity-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `family_id=eq.${familyId}` }, () => fetchActivity())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchActivity])

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

  if (tasks.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-3">🏆</p>
        <p className="font-semibold text-gray-700">No activity yet</p>
        <p className="text-sm text-gray-400 mt-1">Completed tasks will appear here</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Activity</h1>

      {/* Mobile timeline */}
      <div className="md:hidden">
        <MobileTimeline
          tasks={tasks}
          profileMap={profileMap}
          acting={acting}
          onUndo={handleUndo}
          onShare={handleShare}
        />
      </div>

      {/* Desktop columns */}
      <div className="hidden md:block">
        <DesktopColumns
          tasks={tasks}
          profiles={profiles}
          profileMap={profileMap}
          acting={acting}
          onUndo={handleUndo}
          onShare={handleShare}
        />
      </div>
    </div>
  )
}
