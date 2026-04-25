import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { ActivityClient } from './ActivityClient'
import type { Profile } from '@/types'

function utcDateStr(d: Date): string {
  const y  = d.getUTCFullYear()
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default async function ActivityPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  // Current week Mon→Sun in UTC (consistent with completed_at UTC timestamps)
  const now    = new Date()
  const dow    = now.getUTCDay()
  const monday = new Date(now)
  monday.setUTCDate(monday.getUTCDate() - (dow + 6) % 7)
  monday.setUTCHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 7)

  const weekStart = utcDateStr(monday)
  const weekEnd   = utcDateStr(sunday)

  const db = createAdminClient()
  const [{ data: tasks }, { data: profiles }, { data: family }, { data: profile }] = await Promise.all([
    db.from('tasks')
      .select('id, title, point_bounty, is_bounty, is_shared, completed_at, completed_by, assigned_to, family_id')
      .eq('family_id', session.familyId)
      .eq('status', 'completed')
      .gte('completed_at', `${weekStart}T00:00:00`)
      .lt('completed_at',  `${weekEnd}T00:00:00`)
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
          initialWeekStart={weekStart}
        />
      </main>
      <BottomNav />
    </div>
  )
}
