import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()
  const [{ data: family }, { data: members }, { data: profile }] = await Promise.all([
    db.from('families').select('*').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('profiles').select('*').eq('id', session.userId).single(),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Settings" />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-4">
        <SettingsClient
          profile={profile}
          family={family}
          members={members ?? []}
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
        />
      </main>
      <BottomNav />
    </div>
  )
}
