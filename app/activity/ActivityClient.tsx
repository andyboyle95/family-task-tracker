'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

interface CompletedTask {
  id: string
  title: string
  point_bounty: number
  is_bounty: boolean
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
    const today = new Date()
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    let label: string
    if (d.toDateString() === today.toDateString())     label = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    else label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(t)
  }
  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }))
}

export function ActivityClient({ initialTasks, profiles, familyId }: Props) {
  const [tasks, setTasks] = useState<CompletedTask[]>(initialTasks)
  const supabase = createClient()

  const profileMap = new Map(profiles.map(p => [p.id, p]))

  const fetchActivity = useCallback(async () => {
    const res = await fetch('/api/activity')
    if (res.ok) setTasks(await res.json())
  }, [])

  useEffect(() => {
    const ch = supabase.channel('activity-rt')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tasks',
        filter: `family_id=eq.${familyId}`,
      }, () => fetchActivity())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchActivity])

  const groups = groupByDay(tasks)

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
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Activity</h1>
      {groups.map(({ label, tasks: dayTasks }) => (
        <section key={label}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</p>
          <div className="space-y-2">
            {dayTasks.map(task => {
              const completerId = task.completed_by ?? task.assigned_to
              const completer = completerId ? profileMap.get(completerId) : null
              return (
                <div key={task.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: completer?.avatar_color ?? '#6366f1' }}
                  >
                    {completer ? completer.name[0].toUpperCase() : '?'}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      <span className="font-semibold">{completer?.name ?? 'Someone'}</span>
                      {' '}
                      {task.is_bounty ? 'claimed' : 'completed'}
                      {' '}
                      <span className="font-medium text-gray-900">{task.title}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {task.completed_at ? relativeTime(task.completed_at) : ''}
                    </p>
                  </div>

                  {/* Points badge */}
                  <div className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    task.is_bounty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {task.is_bounty
                      ? <Zap size={11} className="fill-amber-500 text-amber-500" />
                      : <CheckCircle2 size={11} />}
                    +{task.point_bounty} pts
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
