'use client'

interface Props {
  title: string
  subtitle?: string
  right?: React.ReactNode
}

export function Header({ title, subtitle, right }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {right && <div>{right}</div>}
      </div>
    </header>
  )
}
