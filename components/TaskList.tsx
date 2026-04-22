'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ListPlus, Zap, CheckCircle2, Sparkles } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { BulkAddModal } from './BulkAddModal'
import { LogWorkModal } from './LogWorkModal'
import { createClient } from '@/lib/supabase/client'
import type { Task, Profile, TaskFormData } from '@/types'
import { format } from 'date-fns'

interface Props {
  initialTasks: Task[]
  members: Profile[]
  currentUserId: string
  familyId: string
}

interface UndoState {
  taskId: string
  title: string
  points: number
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'mine',     label: 'Mine' },
  { key: 'today',    label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
] as const
type Filter = typeof FILTERS[number]['key']

const UNDO_SECONDS = 15

/* ── Grouped view for the "All" filter ──────────────────────────────────── */
interface GroupedProps {
  pending: Task[]
  done: Task[]
  members: Profile[]
  currentUserId: string
  onComplete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEdit: (task: Task) => void
}

function GroupedTaskList({ pending, done, members, currentUserId, onComplete, onUncomplete, onDelete, onEdit }: GroupedProps) {
  const cardProps = { onComplete, onUncomplete, onDelete, onEdit }

  const mine       = pending.filter(t => t.assigned_to === currentUserId)
  const others     = members.filter(m => m.id !== currentUserId)
  const unassigned = pending.filter(t => !t.assigned_to)

  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <section>
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider pb-2">Your tasks</p>
          <div className="space-y-2.5">
            {mine.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
          </div>
        </section>
      )}

      {others.map(member => {
        const theirTasks = pending.filter(t => t.assigned_to === member.id)
        if (theirTasks.length === 0) return null
        return (
          <section key={member.id}>
            <div className="flex items-center gap-2 pb-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: member.avatar_color }}>
                {member.name[0].toUpperCase()}
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{member.name}</p>
            </div>
            <div className="space-y-2.5">
              {theirTasks.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
            </div>
          </section>
        )
      })}

      {unassigned.length > 0 && (
        <section>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pb-2">Unassigned</p>
          <div className="space-y-2.5">
            {unassigned.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pb-2">Completed</p>
          <div className="space-y-2.5">
            {done.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
          </div>
        </section>
      )}
    </div>
  )
}

export function TaskList({ initialTasks, members, currentUserId, familyId }: Props) {
  const [tasks, setTasks]         = useState<Task[]>(initialTasks)
  const [filter, setFilter]       = useState<Filter>('all')
  const [showModal, setShowModal]   = useState(false)
  const [showBulk, setShowBulk]   = useState(false)
  const [showLogWork, setShowLogWork] = useState(false)
  const [editTask, setEditTask]   = useState<Task | null>(null)
  const [undo, setUndo]          = useState<UndoState | null>(null)
  const [undoProgress, setUndoProgress] = useState(100)
  const undoTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoTick   = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase   = createClient()

  const fetchTasks = useCallback(async (f: Filter = filter) => {
    const res = await fetch(`/api/tasks?filter=${f}`)
    if (res.ok) setTasks(await res.json())
  }, [filter])

  useEffect(() => {
    const ch = supabase.channel('tasks-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `family_id=eq.${familyId}` },
        () => fetchTasks())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchTasks])

  // Undo timer
  useEffect(() => {
    if (!undo) return
    setUndoProgress(100)
    const start = Date.now()
    undoTick.current = setInterval(() => {
      setUndoProgress(Math.max(0, 100 - ((Date.now() - start) / (UNDO_SECONDS * 10))))
    }, 100)
    undoTimer.current = setTimeout(() => {
      clearInterval(undoTick.current!)
      setUndo(null)
    }, UNDO_SECONDS * 1000)
    return () => {
      clearTimeout(undoTimer.current!)
      clearInterval(undoTick.current!)
    }
  }, [undo])

  async function handleFilterChange(f: Filter) {
    setFilter(f)
    await fetchTasks(f)
  }

  async function handleSave(data: TaskFormData) {
    const due_at = data.due_at
      ? new Date(`${data.due_at}T${data.due_time || '09:00'}`).toISOString()
      : null
    const payload = {
      title: data.title,
      notes: data.notes || null,
      assigned_to: data.is_bounty ? null : (data.assigned_to || null),
      due_at,
      point_bounty: data.point_bounty,
      recurrence_rule: data.recurrence_rule || null,
      is_bounty: data.is_bounty,
    }
    if (editTask) {
      await fetch(`/api/tasks/${editTask.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setShowModal(false)
    setEditTask(null)
    fetchTasks()
  }

  async function handleComplete(id: string) {
    const task = tasks.find(t => t.id === id)
    const res = await fetch(`/api/tasks/${id}/complete`, { method: 'POST' })
    if (res.ok && task) {
      const { points_awarded } = await res.json()
      // Clear any existing undo first
      clearTimeout(undoTimer.current!)
      clearInterval(undoTick.current!)
      setUndo({ taskId: id, title: task.title, points: points_awarded ?? task.point_bounty })
      fetchTasks()
    }
  }

  async function handleUndo() {
    if (!undo) return
    clearTimeout(undoTimer.current!)
    clearInterval(undoTick.current!)
    await fetch(`/api/tasks/${undo.taskId}/uncomplete`, { method: 'POST' })
    setUndo(null)
    fetchTasks()
  }

  async function handleUncomplete(id: string) {
    await fetch(`/api/tasks/${id}/uncomplete`, { method: 'POST' })
    fetchTasks()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleBulkSave(taskForms: TaskFormData[]) {
    const rows = taskForms.map(data => ({
      title:           data.title,
      notes:           data.notes || null,
      assigned_to:     data.is_bounty ? null : (data.assigned_to || null),
      due_at:          data.due_at ? new Date(`${data.due_at}T${data.due_time || '09:00'}`).toISOString() : null,
      point_bounty:    data.point_bounty,
      recurrence_rule: data.recurrence_rule || null,
      is_bounty:       data.is_bounty,
    }))
    await fetch('/api/tasks/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) })
    setShowBulk(false)
    fetchTasks()
  }

  function handleEdit(task: Task) { setEditTask(task); setShowModal(true) }

  // Only show bounties that are due today or earlier (or have no due date).
  // This prevents tomorrow's recurring bounty from bleeding through after today's is claimed.
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
  const bounties = tasks.filter(t =>
    t.is_bounty &&
    t.status === 'pending' &&
    (!t.due_at || new Date(t.due_at) <= endOfToday)
  )
  const pending  = tasks.filter(t => !t.is_bounty && t.status === 'pending')
  const done     = tasks.filter(t => !t.is_bounty && t.status === 'completed')

  return (
    <>
      <div className="pb-32 space-y-5">
        {/* ── Daily bounties section ─────────────────────────────── */}
        {bounties.length > 0 && (
          <section className="px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
                <Zap size={13} className="fill-amber-500 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wide">Daily Bounties</span>
              </div>
              <span className="text-xs text-gray-400">{bounties.length} available</span>
            </div>
            <div className="space-y-3">
              {bounties.map(t => (
                <TaskCard key={t.id} task={t} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
            </div>
          </section>
        )}

        {/* ── Filter tabs ────────────────────────────────────────── */}
        <div className="flex gap-1.5 overflow-x-auto px-4 scrollbar-hide">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => handleFilterChange(f.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter === f.key
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Task list ──────────────────────────────────────────── */}
        <div className="px-4 space-y-2.5">
          {pending.length === 0 && done.length === 0 && bounties.length === 0 && (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">🎉</p>
              <p className="font-semibold text-gray-700">All clear!</p>
              <p className="text-sm text-gray-400 mt-1">Tap + to add a task</p>
            </div>
          )}

          {filter === 'all' ? (
            <GroupedTaskList
              pending={pending}
              done={done}
              members={members}
              currentUserId={currentUserId}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ) : (
            <>
              {pending.map(t => (
                <TaskCard key={t.id} task={t} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
              {done.length > 0 && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-3 pb-1">Completed</p>
                  {done.map(t => (
                    <TaskCard key={t.id} task={t} onComplete={handleComplete} onUncomplete={handleUncomplete} onDelete={handleDelete} onEdit={handleEdit} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── FABs ───────────────────────────────────────────────── */}
      <button
        onClick={() => setShowLogWork(true)}
        className="fixed bottom-52 right-4 w-12 h-12 bg-white hover:bg-gray-50 active:scale-95 text-purple-600 rounded-2xl shadow-md shadow-gray-200 border border-gray-200 flex items-center justify-center transition-all z-40"
        title="Log work with AI"
      >
        <Sparkles size={20} />
      </button>
      <button
        onClick={() => setShowBulk(true)}
        className="fixed bottom-36 right-4 w-12 h-12 bg-white hover:bg-gray-50 active:scale-95 text-indigo-600 rounded-2xl shadow-md shadow-gray-200 border border-gray-200 flex items-center justify-center transition-all z-40"
        title="Bulk add tasks"
      >
        <ListPlus size={22} />
      </button>
      <button
        onClick={() => { setEditTask(null); setShowModal(true) }}
        className="fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl shadow-lg shadow-indigo-300 flex items-center justify-center transition-all z-40"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ── Undo toast ─────────────────────────────────────────── */}
      {undo && (
        <div className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto z-50 animate-slide-up">
          <div className="bg-gray-900 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-xl">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{undo.title}</p>
              <p className="text-xs text-gray-400">+{undo.points} pts earned</p>
            </div>
            <button onClick={handleUndo}
              className="shrink-0 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors">
              Undo
            </button>
          </div>
          {/* Countdown bar */}
          <div className="mx-2 h-0.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-none"
              style={{ width: `${undoProgress}%` }} />
          </div>
        </div>
      )}

      {/* ── Single task modal ──────────────────────────────────── */}
      {showModal && (
        <AddTaskModal
          members={members}
          currentUserId={currentUserId}
          editTask={editTask}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTask(null) }}
        />
      )}

      {/* ── Bulk add modal ─────────────────────────────────────── */}
      {showBulk && (
        <BulkAddModal
          members={members}
          onSave={handleBulkSave}
          onClose={() => setShowBulk(false)}
        />
      )}

      {/* ── Log work modal ─────────────────────────────────────── */}
      {showLogWork && (
        <LogWorkModal
          members={members}
          onClose={() => setShowLogWork(false)}
          onSaved={() => fetchTasks()}
        />
      )}
    </>
  )
}
