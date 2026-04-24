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

  const [{ data: tasks }, { data: members }, { data: family }, { data: profile }] = await Promise.all([
    db.from('tasks')
      .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color), creator:profiles!tasks_created_by_fkey(id,name)`)
      .eq('family_id', session.familyId)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
  ])

  // Compute current user's points from task history so the header matches the leaderboard
  const allTasks = (tasks ?? []) as Task[]
  const computedPoints = allTasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => {
      const isForMe = t.is_shared
        ? (t.completed_by === session.userId || t.assigned_to === session.userId)
        : (t.completed_by ?? t.assigned_to) === session.userId
      if (!isForMe) return sum
      return sum + (t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty)
    }, 0)
  const profileForHeader = profile ? { ...(profile as Profile), points: computedPoints } : null

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        familyName={family?.name ?? 'Family Tasks'}
        currentUser={profileForHeader}
        right={<PushManager />}
      />
      <main className="max-w-7xl mx-auto pt-4">
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
