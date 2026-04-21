import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { TaskList } from '@/components/TaskList'
import { PushManager } from '@/components/PushManager'
import type { Task, Profile } from '@/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (!profile?.family_id) redirect('/join')

  const [{ data: tasks }, { data: members }, { data: family }] = await Promise.all([
    supabase
      .from('tasks')
      .select(`*, assignee:profiles!tasks_assigned_to_fkey(id,name,avatar_color), creator:profiles!tasks_created_by_fkey(id,name)`)
      .eq('family_id', profile.family_id)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('family_id', profile.family_id),
    supabase.from('families').select('name').eq('id', profile.family_id).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Tasks"
        subtitle={family?.name}
        right={<PushManager />}
      />
      <main className="max-w-lg mx-auto pt-4 space-y-3">
        <TaskList
          initialTasks={(tasks as Task[]) ?? []}
          members={(members as Profile[]) ?? []}
          currentUserId={user.id}
          familyId={profile.family_id}
        />
      </main>
      <BottomNav />
    </div>
  )
}
