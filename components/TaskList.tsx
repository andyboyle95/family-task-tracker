'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ListPlus, Zap, CheckCircle2, Sparkles, LayoutGrid, List } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { BulkAddModal } from './BulkAddModal'
import { LogWorkModal } from './LogWorkModal'
import { KanbanView } from './KanbanView'
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
  const [showModal, setShowModal]     = useState(false)
  const [showBulk, setShowBulk]       = useState(false)
  const [showLogWork, setShowLogWork] = useState(false)
  const [editTask, setEditTask]       = useState<Task | null>(null)
  const [viewMode, setViewMode]       = useState<'list' | 'kanban'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'kanban' : 'list'
  )
  const [undo, setUndo]          = useState<UndoState | null>(null)
  const [undoProgress, setUndoProgress] = useState(100)
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)
  const undoTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoTick    = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase    = createClient()

  function showFeedback(msg: string) {
    if (feedbackRef.current) clearTimeout(feedbackRef.current)
    setFeedbackToast(msg)
    feedbackRef.current = setTimeout(() => setFeedbackToast(null), 2500)
  }

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

  async function handleUpdate(id: string, patch: { title?: string; point_bounty?: number }) {
    const isPointsOnly = 'point_bounty' in patch && !('title' in patch)
    const url = isPointsOnly ? `/api/tasks/${id}/points` : `/api/tasks/${id}`
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (isPointsOnly) showFeedback(`Points updated to ${patch.point_bounty}`)
    else if ('title' in patch) showFeedback('Task renamed')
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
        {/* ── Daily bounties section — hidden in kanban (bounties live in first column) */}
        {bounties.length > 0 && viewMode !== 'kanban' && (
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

        {/* ── Toolbar: filter tabs + view toggle ────────────────── */}
        <div className="flex items-center gap-2 px-4">
          {/* Filter tabs — always on mobile, hidden on desktop kanban */}
          <div className={`flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 ${viewMode === 'kanban' ? 'md:hidden' : ''}`}>
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
          {/* Spacer on desktop kanban so toggle stays right */}
          {viewMode === 'kanban' && <div className="hidden md:block flex-1" />}
          <div className="flex shrink-0 bg-white border border-gray-200 rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-full transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
              title="List view"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-full transition-all ${viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
              title="Kanban view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        {/* ── Kanban view ────────────────────────────────────────── */}
        {viewMode === 'kanban' && (
          <KanbanView
            tasks={tasks}
            members={members}
            currentUserId={currentUserId}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onEdit={handleEdit}
            onUpdate={handleUpdate}
          />
        )}

        {/* ── Task list ──────────────────────────────────────────── */}
        {viewMode === 'list' && <div className="px-4 space-y-2.5">
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
        </div>}
      </div>

      {/* ── FABs ───────────────────────────────────────────────── */}
      <button
        onClick={() => setShowLogWork(true)}
        className="fixed bottom-52 md:bottom-[140px] right-4 h-12 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-2xl shadow-lg shadow-purple-200 flex items-center gap-2 px-4 transition-all z-40"
        title="Log work with AI"
      >
        <Sparkles size={18} />
        <span className="text-sm font-semibold">Log work</span>
      </button>
      <button
        onClick={() => setShowBulk(true)}
        className="fixed bottom-36 md:bottom-[76px] right-4 w-12 h-12 bg-white hover:bg-gray-50 active:scale-95 text-indigo-600 rounded-2xl shadow-md shadow-gray-200 border border-gray-200 flex items-center justify-center transition-all z-40"
        title="Bulk add tasks"
      >
        <ListPlus size={22} />
      </button>
      <button
        onClick={() => { setEditTask(null); setShowModal(true) }}
        className="fixed bottom-20 md:bottom-6 right-4 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl shadow-lg shadow-indigo-300 flex items-center justify-center transition-all z-40"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ── Feedback toast ─────────────────────────────────────── */}
      {feedbackToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-xl whitespace-nowrap animate-slide-up">
            {feedbackToast}
          </div>
        </div>
      )}

      {/* ── Undo toast ─────────────────────────────────────────── */}
      {undo && (
        <div className="fixed bottom-20 md:bottom-24 left-4 right-20 md:right-24 max-w-lg z-50 animate-slide-up">
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
          currentUserId={currentUserId}
          onClose={() => setShowLogWork(false)}
          onSaved={() => fetchTasks()}
        />
      )}
    </>
  )
}
