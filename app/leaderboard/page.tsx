import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { BottomNav } from '@/components/BottomNav'
import {
  Leaderboard,
  type MemberStats,
  type ChartDay,
  type CategoryTotal,
  type TaskChampion,
  type FamilyStats,
} from '@/components/Leaderboard'
import type { Profile } from '@/types'

/* ── Category definitions — order determines first-match priority ─── */
const CATEGORY_DEFS = [
  { label: 'Little Monkey Care', emoji: '🐒', regex: /bottle|baby|napp(y|ie)|formula|wean|nursery|cot|buggy|pram|stroller|little.?monkey/ },
  { label: 'Cooking & Meals',    emoji: '🍳', regex: /cook|dinner|lunch|breakfast|meal|food|recipe|supper|make.?dinner|tea(?!.*bag)/ },
  { label: 'Cleaning',           emoji: '🧹', regex: /clean|hoover|vacuum|sweep|mop|wipe|toilet|loo|dishwasher|washing.?up|scrub|tidy(?!.*up.*dinner)|tidy.?up|clear.?up|clear.?after/ },
  { label: 'Laundry',            emoji: '👕', regex: /laundry|iron|hang.*out|tumble|clothes.*wash|wash.*cloth|fold.*cloth|dry.*laundry/ },
  { label: 'Garden & Outdoors',  emoji: '🌿', regex: /garden|mow|lawn|weed|water.*plant|plant.*water|trim.*hedge|hedge|scarif|compost|outdoor|outside/ },
  { label: 'Dog & Pets',         emoji: '🐕', regex: /dog|walk.*dog|dog.*walk|pet food|vet|cat food|\bcat\b|fish|hamster/ },
  { label: 'DIY & Installations',emoji: '🔨', regex: /install|fix\b|hang\b|repair|treat\b|electric|plumb|shelf|curtain|hook\b|bulb\b|u.?bend|put.?up|wire\b|solder/ },
  { label: 'Decorating',         emoji: '🎨', regex: /paint|refurb|redesign|decor|renovat|refit|stain\b|wallpaper/ },
  { label: 'Decluttering',       emoji: '📦', regex: /sort(?! out dinner)|rationalise|rationalis|organis|donate|sell\b|return\b|clear.?out|cupboard|cabinet|tupperware|ottoman/ },
  { label: 'Shopping & Orders',  emoji: '🛒', regex: /order|buy\b|purchas|shop|groceri|tesco|asda|sainsbury|amazon|collect|pick.?up/ },
  { label: 'Admin & Planning',   emoji: '📋', regex: /book\b|confirm|decide|research|plan\b|oversee|deliver|coordinat|visit\b|choos|measure|quote\b|sign\b|\bcall\b/ },
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

function belongsTo(t: HistoryTask, userId: string): boolean {
  if (t.is_shared) return t.completed_by === userId || t.assigned_to === userId
  return (t.completed_by ?? t.assigned_to) === userId
}

function categoryFor(title: string): string {
  const tl = title.toLowerCase()
  return CATEGORY_DEFS.find(d => d.regex.test(tl))?.label ?? 'Other'
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
  if (/bottle/.test(t)) return '🍼 Bottle Champion'
  if (/baby|napp/.test(t)) return '🐒 Little Monkey Hero'
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
    const mine           = history.filter(t => belongsTo(t, p.id))
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

    // Per-person category breakdown — every task lands in exactly one bucket
    const catMap = new Map<string, { emoji: string; points: number }>()
    for (const t of mine) {
      const cat  = categoryFor(t.title)
      const def  = CATEGORY_DEFS.find(d => d.label === cat)
      const emoji = def?.emoji ?? '✨'
      const pts  = effectivePts(t)
      const cur  = catMap.get(cat) ?? { emoji, points: 0 }
      catMap.set(cat, { emoji, points: cur.points + pts })
    }
    const category_breakdown = [...catMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.points - a.points)

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
      category_breakdown,
      achievement: getAchievement(task_breakdown, points_alltime),
    }
  })
}

function buildCategories(profiles: Profile[], history: HistoryTask[]): CategoryTotal[] {
  const result: CategoryTotal[] = []

  // Each task lands in its first-matching category only (no double-counting)
  const assigned = new Map<string, string>() // taskId → category label
  for (const t of history) {
    assigned.set(t.id, categoryFor(t.title))
  }

  // Named categories
  for (const def of CATEGORY_DEFS) {
    const matching = history.filter(t => assigned.get(t.id) === def.label)
    if (matching.length === 0) continue
    const totalPts = matching.reduce((s, t) => s + effectivePts(t), 0)
    const byUser = profiles
      .map(p => ({
        userId: p.id, name: p.name, color: p.avatar_color,
        points: matching.filter(t => belongsTo(t, p.id)).reduce((s, t) => s + effectivePts(t), 0),
      }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points)
    result.push({ label: def.label, emoji: def.emoji, points: totalPts, count: matching.length, byUser })
  }

  // Other catchall — tasks that matched no named category
  const other = history.filter(t => assigned.get(t.id) === 'Other')
  if (other.length > 0) {
    const totalPts = other.reduce((s, t) => s + effectivePts(t), 0)
    const byUser = profiles
      .map(p => ({
        userId: p.id, name: p.name, color: p.avatar_color,
        points: other.filter(t => belongsTo(t, p.id)).reduce((s, t) => s + effectivePts(t), 0),
      }))
      .filter(u => u.points > 0)
      .sort((a, b) => b.points - a.points)
    result.push({ label: 'Other', emoji: '✨', points: totalPts, count: other.length, byUser })
  }

  return result.sort((a, b) => b.points - a.points)
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
        .filter(t => belongsTo(t, p.id) && t.completed_at?.startsWith(date))
        .reduce((s, t) => s + effectivePts(t), 0)
    }
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      byUser,
    }
  })
}

function buildTaskInsights(profiles: Profile[], history: HistoryTask[]): TaskChampion[] {
  // Normalise title → canonical form + per-user count
  const byTitle = new Map<string, { canonical: string; userCounts: Map<string, number> }>()

  for (const t of history) {
    const key = t.title.toLowerCase().trim()
    if (!byTitle.has(key)) byTitle.set(key, { canonical: t.title, userCounts: new Map() })
    const entry = byTitle.get(key)!
    for (const p of profiles) {
      if (belongsTo(t, p.id)) {
        entry.userCounts.set(p.id, (entry.userCounts.get(p.id) ?? 0) + 1)
      }
    }
  }

  return [...byTitle.values()]
    .map(entry => {
      const champions = [...entry.userCounts.entries()]
        .map(([userId, count]) => {
          const p = profiles.find(pp => pp.id === userId)!
          return { userId, name: p.name, color: p.avatar_color, count }
        })
        .sort((a, b) => b.count - a.count)
      return { title: entry.canonical, totalCount: champions.reduce((s, c) => s + c.count, 0), champions }
    })
    .filter(x => x.totalCount >= 2)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 12)
}

function buildFamilyStats(profiles: Profile[], history: HistoryTask[]): FamilyStats {
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)
  weekStart.setHours(0, 0, 0, 0)

  // Top task by raw count
  const titleCounts = new Map<string, number>()
  for (const t of history) {
    const key = t.title.toLowerCase().trim()
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1)
  }
  const topEntry = [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const topTask = topEntry
    ? history.find(t => t.title.toLowerCase().trim() === topEntry[0])?.title ?? null
    : null

  // Most productive person this week (by effective points)
  const weekLeaders = profiles
    .map(p => ({
      name: p.name, color: p.avatar_color,
      points: history
        .filter(t => belongsTo(t, p.id) && t.completed_at && new Date(t.completed_at) >= weekStart)
        .reduce((s, t) => s + effectivePts(t), 0),
    }))
    .sort((a, b) => b.points - a.points)

  // Uncategorised count (for transparency)
  const uncategorisedCount = history.filter(t => categoryFor(t.title) === 'Other').length

  return {
    totalTasks: history.length,
    topTask,
    mostProductiveThisWeek: weekLeaders[0]?.points > 0 ? weekLeaders[0] : null,
    uncategorisedCount,
  }
}

export default async function LeaderboardPage() {
  const session = await getSession()
  if (!session) redirect('/join')

  const db = createAdminClient()

  const [{ data: members }, { data: family }, { data: profile }, { data: history }] = await Promise.all([
    db.from('profiles').select('*').eq('family_id', session.familyId),
    db.from('families').select('name').eq('id', session.familyId).single(),
    db.from('profiles').select('*').eq('id', session.userId).single(),
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
  const categories = buildCategories(profiles, hist)
  const insights   = buildTaskInsights(profiles, hist)
  const familyStats = buildFamilyStats(profiles, hist)

  // Sync profiles.points to computed all-time totals
  const outOfSync = stats.filter(s => s.profile.points !== s.points_alltime)
  if (outOfSync.length > 0) {
    await Promise.all(
      outOfSync.map(s =>
        db.from('profiles').update({ points: s.points_alltime }).eq('id', s.profile.id)
      )
    )
  }

  const profileForHeader = profile
    ? { ...(profile as Profile), points: stats.find(s => s.profile.id === session.userId)?.points_alltime ?? (profile as Profile).points }
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <Header familyName={family?.name ?? 'Family Tasks'} currentUser={profileForHeader} />
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-32 md:pb-8">
        <Leaderboard
          stats={stats}
          currentUserId={session.userId}
          chartData={chart}
          categories={categories}
          insights={insights}
          familyStats={familyStats}
        />
      </main>
      <BottomNav />
    </div>
  )
}
