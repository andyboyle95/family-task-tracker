import { cookies } from 'next/headers'

export interface Session {
  userId: string
  familyId: string
  userName: string
}

const COOKIE = 'ftt_session'
const ONE_YEAR = 60 * 60 * 24 * 365

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const raw = store.get(COOKIE)?.value
  if (!raw) return null
  try { return JSON.parse(raw) as Session } catch { return null }
}

export { COOKIE, ONE_YEAR }
