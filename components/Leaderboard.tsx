'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Profile } from '@/types'

export interface MemberStats {
  profile: Profile
  points_today: number
  points_week: number
  task_breakdown: { title: string; count: number; points: number }[]
  achievement: string
}

export interface ChartDay {
  date: string
  label: string
  byUser: Record<string, number>
}

interface Props {
  stats: MemberStats[]
  currentUserId: string
  chartData: ChartDay[]
}

const MEDALS = ['🥇', '🥈', '🥉']

/* ── SVG cumulative points race chart ──────────────────────────────────── */
function PointsChart({ stats, chartData }: { stats: MemberStats[]; chartData: ChartDay[] }) {
  const W = 320, H = 110
  const padL = 6, padR = 6, padT = 8, padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  // Build cumulative totals per person per day
  const lines = stats.map(s => {
    let cum = 0
    const pts = chartData.map(day => {
      cum += day.byUser[s.profile.id] ?? 0
      return cum
    })
    return { id: s.profile.id, color: s.profile.avatar_color, name: s.profile.name, pts }
  })

  const maxPts = Math.max(...lines.flatMap(l => l.pts), 1)
  const n = chartData.length

  const cx = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const cy = (p: number) => padT + innerH - (p / maxPts) * innerH

  const toPath = (pts: number[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(p).toFixed(1)}`).join(' ')

  // Show a label every ~3 days
  const labelIdxs = chartData.reduce<number[]>((acc, _, i) => {
    if (i === 0 || i === n - 1 || i % 3 === 0) acc.push(i)
    return acc
  }, [])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {/* Subtle grid */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f}
          x1={padL} y1={cy(maxPts * f).toFixed(1)}
          x2={W - padR} y2={cy(maxPts * f).toFixed(1)}
          stroke="#f3f4f6" strokeWidth="1" />
      ))}

      {/* Lines */}
      {lines.map(l => (
        <path key={l.id} d={toPath(l.pts)} fill="none"
          stroke={l.color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      ))}

      {/* End-point dots + name labels */}
      {lines.map(l => {
        const last = l.pts[n - 1] ?? 0
        return (
          <circle key={l.id}
            cx={cx(n - 1).toFixed(1)} cy={cy(last).toFixed(1)}
            r="3.5" fill={l.color} />
        )
      })}

      {/* X axis labels */}
      {labelIdxs.map(i => (
        <text key={i} x={cx(i).toFixed(1)} y={H - 6}
          textAnchor="middle" fill="#9ca3af" fontSize="8">
          {chartData[i].label.split(' ')[0]}
        </text>
      ))}
    </svg>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function Leaderboard({ stats, currentUserId, chartData }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = [...stats].sort((a, b) => b.profile.points - a.profile.points)
  const me = stats.find(s => s.profile.id === currentUserId)

  return (
    <div className="space-y-5">

      {/* ── Your stats banner ──────────────────────────────────── */}
      {me && (
        <div className="bg-indigo-600 rounded-2xl p-4 text-white">
          <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-3">Your performance</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Today',     value: me.points_today },
              { label: 'This week', value: me.points_week },
              { label: 'All time',  value: me.profile.points },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3">
                <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                <p className="text-xs text-indigo-200 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rankings ───────────────────────────────────────────── */}
      <div className="space-y-2">
        {sorted.map((s, i) => {
          const isMe       = s.profile.id === currentUserId
          const isExpanded = expanded === s.profile.id
          const rank       = i + 1

          return (
            <div key={s.profile.id}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isMe ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-white'
              }`}>

              {/* Row */}
              <button
                onClick={() => setExpanded(isExpanded ? null : s.profile.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-8 text-center shrink-0">
                  {rank <= 3
                    ? <span className="text-xl">{MEDALS[rank - 1]}</span>
                    : <span className="text-sm font-bold text-gray-400">#{rank}</span>}
                </div>

                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ backgroundColor: s.profile.avatar_color }}>
                  {s.profile.name[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isMe ? 'text-indigo-700' : 'text-gray-900'}`}>
                    {s.profile.name}
                    {isMe && <span className="text-xs font-normal text-indigo-400 ml-1">(you)</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{s.achievement}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-amber-600">{s.profile.points.toLocaleString()}</span>
                  <span className="text-xs text-gray-400 ml-0.5">pts</span>
                </div>

                <span className="text-gray-300 shrink-0">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">

                  {/* Today / week mini stats */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Today',     value: s.points_today },
                      { label: 'This week', value: s.points_week },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-gray-900">{value.toLocaleString()}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Task breakdown */}
                  {s.task_breakdown.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Points by task</p>
                      <div className="space-y-2">
                        {s.task_breakdown.map(t => {
                          const pct = s.profile.points > 0
                            ? Math.round((t.points / s.profile.points) * 100)
                            : 0
                          return (
                            <div key={t.title} className="flex items-center gap-2">
                              <span className="text-xs text-gray-700 flex-1 truncate">{t.title}</span>
                              <span className="text-xs text-gray-400 shrink-0">×{t.count}</span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: s.profile.avatar_color }} />
                              </div>
                              <span className="text-xs font-semibold text-amber-600 w-14 text-right shrink-0">
                                {t.points.toLocaleString()} pts
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {s.task_breakdown.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No completed tasks yet</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {sorted.length === 0 && (
          <p className="text-center text-gray-400 py-10">No family members yet.</p>
        )}
      </div>

      {/* ── Points race chart ──────────────────────────────────── */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">Points race — last 14 days</p>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
            {sorted.map(s => (
              <div key={s.profile.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.profile.avatar_color }} />
                <span className="text-xs text-gray-500">{s.profile.name}</span>
              </div>
            ))}
          </div>

          <PointsChart stats={sorted} chartData={chartData} />
          <p className="text-[10px] text-gray-300 text-right mt-1">Cumulative pts earned</p>
        </div>
      )}
    </div>
  )
}
