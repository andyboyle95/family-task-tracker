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

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const mm    = String(month).padStart(2, '0')
  const initialMonth = `${year}-${mm}`

  const monthStart = new Date(year, month - 1, 1).toISOString()
  const monthEnd   = new Date(year, month, 1).toISOString()

  const [{ data: tasks }, { data: profiles }, { data: family }, { data: profile }] = await Promise.all([
    db.from('tasks')
      .select('id, title, point_bounty, is_bounty, is_shared, completed_at, completed_by, assigned_to, family_id')
      .eq('family_id', session.familyId)
      .eq('status', 'completed')
      .gte('completed_at', monthStart)
      .lt('completed_at', monthEnd)
      .order('completed_at', { ascending: false }),
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header familyName={family?.name ?? 'Family Tasks'} currentUser={profile as Profile} />
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-32 md:pb-8">
        <ActivityClient
          initialTasks={tasks ?? []}
          profiles={(profiles ?? []) as Profile[]}
          familyId={session.familyId}
          initialMonth={initialMonth}
        />
      </main>
      <BottomNav />
    </div>
  )
}
