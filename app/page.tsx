import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { TaskList } from '@/components/TaskList'
import { PushManager } from '@/components/PushManager'
import type { Task, Profile } from '@/types'

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()

  const [{ data: tasks }, { data: members }, { data: family }] = await Promise.all([
    db.from('tasks')
      .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color), creator:profiles!tasks_created_by_fkey(id,name)`)
      .eq('family_id', session.familyId)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Tasks" subtitle={family?.name} right={<PushManager />} />
      <main className="max-w-lg mx-auto pt-4 space-y-3">
        <TaskList
          initialTasks={(tasks as Task[]) ?? []}
          members={(members as Profile[]) ?? []}
          currentUserId={session.userId}
          familyId={session.familyId}
        />
      </main>
      <BottomNav />
    </div>
  )
}
