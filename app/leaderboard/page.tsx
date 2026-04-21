import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { Leaderboard } from '@/components/Leaderboard'
import type { Profile } from '@/types'

export default async function LeaderboardPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()
  const [{ data: members }, { data: family }, { data: profile }] = await Promise.all([
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header familyName={family?.name ?? 'Family Tasks'} currentUser={profile as Profile} />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32">
        <Leaderboard members={(members as Profile[]) ?? []} currentUserId={session.userId} />
      </main>
      <BottomNav />
    </div>
  )
}
