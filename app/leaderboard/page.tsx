import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { Leaderboard } from '@/components/Leaderboard'
import type { Profile } from '@/types'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('family_id').eq('id', user.id).single()
  if (!profile?.family_id) redirect('/join')

  const { data: members } = await supabase
    .from('profiles').select('*').eq('family_id', profile.family_id)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Leaderboard" subtitle="Family points" />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32">
        <Leaderboard members={(members as Profile[]) ?? []} currentUserId={user.id} />
      </main>
      <BottomNav />
    </div>
  )
}
