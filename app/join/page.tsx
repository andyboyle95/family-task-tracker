'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = [
  '#4f46e5','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#0284c7','#16a34a','#ea580c',
]

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export default function JoinPage() {
  const [tab, setTab] = useState<'join' | 'create'>('join')
  const [code, setCode] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: family } = await supabase
      .from('families').select('id').eq('invite_code', code.trim().toUpperCase()).single()

    if (!family) { setError('Invalid invite code. Check with your family.'); setLoading(false); return }

    await supabase.from('profiles').update({
      family_id: family.id,
      avatar_color: randomColor(),
    }).eq('id', user.id)

    router.push('/')
    router.refresh()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Generate invite code
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase()

    const { data: family, error: familyError } = await supabase
      .from('families').insert({ name: familyName.trim(), invite_code: inviteCode }).select('id').single()

    if (familyError || !family) {
      setError('Could not create family. Try again.')
      setLoading(false)
      return
    }

    await supabase.from('profiles').update({
      family_id: family.id,
      role: 'admin',
      avatar_color: randomColor(),
    }).eq('id', user.id)

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👨‍👩‍👧‍👦</div>
          <h1 className="text-2xl font-bold text-gray-900">Set up your family</h1>
          <p className="text-gray-500 text-sm mt-1">Join an existing family or start a new one</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          {(['join', 'create'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'join' ? 'Join family' : 'Create family'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {tab === 'join' ? (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invite code</label>
                <input
                  type="text" required value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3" maxLength={6}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg text-center tracking-widest font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1 text-center">Get this from the family admin</p>
              </div>
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
                {loading ? 'Joining…' : 'Join family'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Family name</label>
                <input
                  type="text" required value={familyName} onChange={e => setFamilyName(e.target.value)}
                  placeholder="e.g. The Smiths"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <button type="submit" disabled={loading || !familyName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
                {loading ? 'Creating…' : 'Create family'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
