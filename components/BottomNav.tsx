'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CheckSquare, Activity, Trophy, Settings } from 'lucide-react'

const LINKS = [
  { href: '/',            label: 'Tasks',       icon: CheckSquare },
  { href: '/activity',    label: 'Activity',    icon: Activity },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/settings',    label: 'Settings',    icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-40 safe-area-pb">
      <div className="max-w-lg mx-auto flex">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 relative transition-colors">
              <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-indigo-100' : ''}`}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8}
                  className={active ? 'text-indigo-600' : 'text-gray-400'} />
              </div>
              <span className={`text-[10px] font-semibold ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
                {label}
              </span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
