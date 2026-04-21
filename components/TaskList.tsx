'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { createClient } from '@/lib/supabase/client'
import type { Task, Profile, TaskFormData } from '@/types'
import { format } from 'date-fns'

interface Props {
  initialTasks: Task[]
  members: Profile[]
  currentUserId: string
  familyId: string
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
] as const

type Filter = typeof FILTERS[number]['key']

export function TaskList({ initialTasks, members, currentUserId, familyId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [filter, setFilter] = useState<Filter>('all')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const supabase = createClient()

  const fetchTasks = useCallback(async (f: Filter = filter) => {
    const res = await fetch(`/api/tasks?filter=${f}`)
    if (res.ok) setTasks(await res.json())
  }, [filter])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `family_id=eq.${familyId}`,
      }, () => { fetchTasks() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [familyId, supabase, fetchTasks])

  async function handleFilterChange(f: Filter) {
    setFilter(f)
    await fetchTasks(f)
  }

  async function handleSave(data: TaskFormData) {
    const due_at = data.due_at
      ? new Date(`${data.due_at}T${data.due_time || '09:00'}`).toISOString()
      : null

    const payload = {
      title: data.title, notes: data.notes || null,
      assigned_to: data.assigned_to || null, due_at,
      point_bounty: data.point_bounty,
      recurrence_rule: data.recurrence_rule || null,
    }

    if (editTask) {
      await fetch(`/api/tasks/${editTask.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setShowModal(false)
    setEditTask(null)
    fetchTasks()
  }

  async function handleComplete(id: string) {
    await fetch(`/api/tasks/${id}/complete`, { method: 'POST' })
    fetchTasks()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function handleEdit(task: Task) {
    setEditTask(task)
    setShowModal(true)
  }

  const pending = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 px-4 scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => handleFilterChange(f.key)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task lists */}
      <div className="px-4 space-y-2 pb-32">
        {pending.length === 0 && completed.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-gray-500 font-medium">All clear!</p>
            <p className="text-gray-400 text-sm mt-1">Add a task to get started.</p>
          </div>
        )}

        {pending.map(task => (
          <TaskCard key={task.id} task={task} currentUserId={currentUserId}
            onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} />
        ))}

        {completed.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4 pb-1">Completed</p>
            {completed.map(task => (
              <TaskCard key={task.id} task={task} currentUserId={currentUserId}
                onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} />
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditTask(null); setShowModal(true) }}
        className="fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-40"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Modal */}
      {showModal && (
        <AddTaskModal
          members={members}
          currentUserId={currentUserId}
          editTask={editTask}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTask(null) }}
        />
      )}
    </>
  )
}
