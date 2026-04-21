import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { ActivityClient } from './ActivityClient'
import type { Profile } from '@/types'

export default async function ActivityPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()
  const [{ data: tasks }, { data: profiles }, { data: family }, { data: profile }] = await Promise.all([
    db.from('tasks')
      .select('id, title, point_bounty, is_bounty, is_shared, completed_at, completed_by, assigned_to, family_id')
      .eq('family_id', session.familyId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(100),
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header familyName={family?.name ?? 'Family Tasks'} currentUser={profile as Profile} />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32">
        <ActivityClient
          initialTasks={tasks ?? []}
          profiles={profiles ?? []}
          familyId={session.familyId}
        />
      </main>
      <BottomNav />
    </div>
  )
}
