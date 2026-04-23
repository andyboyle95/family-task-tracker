import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import { Leaderboard, type MemberStats, type ChartDay, type CategoryTotal } from '@/components/Leaderboard'
import type { Profile } from '@/types'

const CATEGORY_DEFS = [
  { label: 'DIY & Installations', emoji: '🔨', regex: /install|fix|hang|repair|treat|scarif|hook|bulb|bracket|u-bend|shelf|curtain|put up|wire|plumb|electric/ },
  { label: 'Decorating',          emoji: '🎨', regex: /paint|refurb|redesign|decor|renovati|refit|stain|wallpaper/ },
  { label: 'Decluttering',        emoji: '📦', regex: /sort|rationalise|rationalis|organis|tidy|declutter|donate|sell|return|clear|cupboard|cabinet|clothes|tupperware|frames?|ottoman/ },
  { label: 'Shopping & Orders',   emoji: '🛒', regex: /order|buy|purchas|shop|groceri|grocery|tesco|asda|sainsbury|amazon|get the|collect|pick up/ },
  { label: 'Admin & Planning',    emoji: '📋', regex: /book|confirm|decide|research|plan|oversee|receiv|deliver|coordinat|visit|choos|measure|quote/ },
]

interface HistoryTask {
  id: string
  title: string
  point_bounty: number
  is_shared: boolean
  completed_by: string | null
  assigned_to: string | null
  completed_at: string | null
}

function effectivePts(t: HistoryTask) {
  return t.is_shared ? Math.ceil(t.point_bounty / 2) : t.point_bounty
}

function getAchievement(breakdown: { title: string; count: number }[], totalPoints: number): string {
  if (totalPoints === 0) return '🛋️ Professional Relaxer'
  const top = breakdown[0]
  if (!top) return '🌱 Just Getting Started'
  const t = top.title.toLowerCase()
  if (/dish|washing[\s-]?up/.test(t)) return '🍽️ Dishwasher Devotee'
  if (/bin|trash|rubbish|recycl/.test(t)) return '🗑️ Bin Baron'
  if (/hoover|vacuum|sweep/.test(t)) return '🌪️ Hoover Hero'
  if (/laundry|wash(ing)?|clothes/.test(t)) return '👕 Laundry Legend'
  if (/cook|dinner|lunch|breakfast|meal|food/.test(t)) return '👨‍🍳 Kitchen Commander'
  if (/clean|wipe|mop/.test(t)) return '🧹 Clean Machine'
  if (/shop|grocery|tesco|asda|sainsbury/.test(t)) return '🛒 Trolley Titan'
  if (/garden|mow|lawn|weed|plant/.test(t)) return '🌿 The Lawnfather'
  if (/iron/.test(t)) return '👔 Wrinkle Warrior'
  if (/bathroom|toilet|shower|loo/.test(t)) return '🚿 Throne Guardian'
  if (/bottle/.test(t)) return '🍾 Bottle Brigadier'
  if (/dog|pet|cat|walk/.test(t)) return '🐕 Dog Whisperer'
  if (/car|tyre|oil/.test(t)) return '🚗 Speed Racer'
  if (top.count >= 20) return `🏆 ${top.title} Superfan`
  if (top.count >= 8)  return `⭐ ${top.title} Pro`
  return `✨ ${top.title} Aficionado`
}

function buildStats(profiles: Profile[], history: HistoryTask[]): MemberStats[] {
  const now        = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0)

  return profiles.map(p => {
    const mine = history.filter(t => (t.completed_by ?? t.assigned_to) === p.id)
    const points_alltime = mine.reduce((s, t) => s + effectivePts(t), 0)

    const byTitle = new Map<string, { count: number; points: number }>()
    for (const t of mine) {
      const pts = effectivePts(t)
      const cur = byTitle.get(t.title) ?? { count: 0, points: 0 }
      byTitle.set(t.title, { count: cur.count + 1, points: cur.points + pts })
    }
    const task_breakdown = [...byTitle.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 6)

    return {
      profile: p,
      points_alltime,
      points_today: mine
        .filter(t => t.completed_at && new Date(t.completed_at) >= todayStart)
        .reduce((s, t) => s + effectivePts(t), 0),
      points_week: mine
        .filter(t => t.completed_at && new Date(t.completed_at) >= weekStart)
        .reduce((s, t) => s + effectivePts(t), 0),
      task_breakdown,
      achievement: getAchievement(task_breakdown, points_alltime),
    }
  })
}

function buildCategories(history: HistoryTask[]): CategoryTotal[] {
  return CATEGORY_DEFS.map(def => {
    const matching = history.filter(t => def.regex.test(t.title.toLowerCase()))
    return {
      label: def.label,
      emoji: def.emoji,
      points: matching.reduce((s, t) => s + effectivePts(t), 0),
      count: matching.length,
    }
  }).sort((a, b) => b.points - a.points)
}

function buildChartData(profiles: Profile[], history: HistoryTask[]): ChartDay[] {
  const days: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }

  return days.map(date => {
    const byUser: Record<string, number> = {}
    for (const p of profiles) {
      byUser[p.id] = history
        .filter(t => (t.completed_by ?? t.assigned_to) === p.id && t.completed_at?.startsWith(date))
        .reduce((s, t) => s + effectivePts(t), 0)
    }
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      byUser,
    }
  })
}

export default async function LeaderboardPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()

  const [{ data: members }, { data: family }, { data: profile }, { data: history }] = await Promise.all([
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
    // No date filter — fetch all history so all-time totals are accurate
    db.from('tasks')
      .select('id, title, point_bounty, is_shared, completed_by, assigned_to, completed_at')
      .eq('family_id', session.familyId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true }),
  ])

  const profiles   = (members ?? []) as Profile[]
  const hist       = (history ?? []) as HistoryTask[]
  const stats      = buildStats(profiles, hist)
  const chart      = buildChartData(profiles, hist)
  const categories = buildCategories(hist)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header familyName={family?.name ?? 'Family Tasks'} currentUser={profile as Profile} />
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-32 md:pb-8">
        <Leaderboard stats={stats} currentUserId={session.userId} chartData={chart} categories={categories} />
      </main>
      <BottomNav />
    </div>
  )
}
