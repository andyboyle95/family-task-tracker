'use client'

import type { Profile } from '@/types'

interface Props {
  familyName: string
  currentUser: Profile | null
  right?: React.ReactNode
}

export function Header({ familyName, currentUser, right }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium">Family Tasks</p>
          <h1 className="text-lg font-bold text-gray-900 truncate leading-tight">{familyName}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {right}
          {currentUser && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl pl-2 pr-3 py-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: currentUser.avatar_color }}>
                {currentUser.name[0].toUpperCase()}
              </div>
              <div className="leading-none">
                <p className="text-xs font-semibold text-gray-700">{currentUser.name}</p>
                <p className="text-[10px] text-amber-600 font-bold">⭐ {currentUser.points.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
