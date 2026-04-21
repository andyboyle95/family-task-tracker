import { createAdminClient } from '@/lib/supabase/server'

export async function adjustPoints(userId: string, delta: number): Promise<void> {
  const db = createAdminClient()
  const { data: profile, error: fetchErr } = await db
    .from('profiles').select('points').eq('id', userId).single()
  if (fetchErr || !profile) {
    console.error('[adjustPoints] profile not found:', userId, fetchErr)
    return
  }
  const { error: updateErr } = await db
    .from('profiles').update({ points: profile.points + delta }).eq('id', userId)
  if (updateErr) console.error('[adjustPoints] update failed:', updateErr)
}
