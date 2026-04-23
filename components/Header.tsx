'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CheckSquare, Activity, Trophy, Settings } from 'lucide-react'
import type { Profile } from '@/types'

const LINKS = [
  { href: '/',            label: 'Tasks',       icon: CheckSquare },
  { href: '/activity',    label: 'Activity',    icon: Activity },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/settings',    label: 'Settings',    icon: Settings },
]

interface Props {
  familyName: string
  currentUser: Profile | null
  right?: React.ReactNode
}

export function Header({ familyName, currentUser, right }: Props) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-6">
        {/* Brand */}
        <div className="min-w-0 shrink-0">
          <p className="text-xs text-gray-400 font-medium hidden md:block">Family Tasks</p>
          <h1 className="text-lg font-bold text-gray-900 truncate leading-tight">{familyName}</h1>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}>
                <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
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
