'use client'

import type { Profile } from '@/types'

interface Props {
  members: Profile[]
  currentUserId: string
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({ members, currentUserId }: Props) {
  const sorted = [...members].sort((a, b) => b.points - a.points)

  return (
    <div className="space-y-3">
      {sorted.map((member, i) => {
        const isMe = member.id === currentUserId
        const rank = i + 1
        return (
          <div
            key={member.id}
            className={`flex items-center gap-4 p-4 rounded-2xl transition-colors ${
              isMe ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-gray-100'
            }`}
          >
            {/* Rank */}
            <div className="w-8 text-center">
              {rank <= 3
                ? <span className="text-xl">{MEDALS[rank - 1]}</span>
                : <span className="text-sm font-bold text-gray-400">#{rank}</span>
              }
            </div>

            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
              style={{ backgroundColor: member.avatar_color }}
            >
              {member.name[0].toUpperCase()}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${isMe ? 'text-indigo-700' : 'text-gray-900'}`}>
                {member.name}{isMe && <span className="text-xs font-normal text-indigo-400 ml-1">(you)</span>}
              </p>
            </div>

            {/* Points */}
            <div className="text-right">
              <span className="text-lg font-bold text-amber-600">{member.points.toLocaleString()}</span>
              <span className="text-xs text-gray-400 ml-1">pts</span>
            </div>
          </div>
        )
      })}

      {sorted.length === 0 && (
        <p className="text-center text-gray-400 py-10">No family members yet.</p>
      )}
    </div>
  )
}
