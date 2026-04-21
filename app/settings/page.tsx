import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile?.family_id) redirect('/join')

  const [{ data: family }, { data: members }] = await Promise.all([
    supabase.from('families').select('*').eq('id', profile.family_id).single(),
    supabase.from('profiles').select('*').eq('family_id', profile.family_id),
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
