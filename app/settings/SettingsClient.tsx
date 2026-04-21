'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import type { Profile, Family } from '@/types'

interface Props {
  profile: Profile
  family: Family
  members: Profile[]
  appUrl: string
}

export function SettingsClient({ profile, family, members, appUrl }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const router = useRouter()

  async function switchUser() {
    setSwitching(true)
    await fetch('/api/session', { method: 'DELETE' })
    router.push('/join')
    router.refresh()
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const voiceWebhookUrl = `${appUrl}/api/voice`

  return (
    <div className="space-y-4">
      {/* Current user */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Signed in as</p>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: profile?.avatar_color }}>
            {profile?.name[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{profile?.name}</p>
            <p className="text-sm text-amber-600 font-medium">{profile?.points.toLocaleString()} points</p>
          </div>
          <button onClick={switchUser} disabled={switching}
            className="ml-auto flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50">
            <RefreshCw size={14} className={switching ? 'animate-spin' : ''} />
            Switch user
          </button>
        </div>
      </section>

      {/* Family */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Family</h2>
        <p className="text-2xl font-bold text-indigo-600">{family?.name}</p>

        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Invite code</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-xl tracking-widest text-center">
              {family?.invite_code}
            </code>
            <button onClick={() => copy(family?.invite_code, 'code')}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
              {copied === 'code' ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-600" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Share this with family members to join.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">Members</label>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: m.avatar_color }}>
                  {m.name[0].toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{m.name}</span>
                {m.id === profile?.id && <span className="text-xs text-indigo-400">(you)</span>}
                <span className="ml-auto text-xs text-amber-600 font-medium">{m.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Voice webhook */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Voice assistant</h2>
        <p className="text-sm text-gray-500">
          Use your invite code as the <code className="bg-gray-100 px-1 rounded text-xs">token</code> when calling the webhook below. Works with Siri Shortcuts and IFTTT.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 break-all">
            {voiceWebhookUrl}
          </code>
          <button onClick={() => copy(voiceWebhookUrl, 'webhook')}
            className="shrink-0 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
            {copied === 'webhook' ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-600" />}
          </button>
        </div>
        <details className="text-sm">
          <summary className="text-indigo-600 cursor-pointer font-medium">Siri Shortcuts setup</summary>
          <ol className="mt-2 space-y-1 text-gray-600 list-decimal list-inside text-xs leading-relaxed">
            <li>Open Shortcuts app → New Shortcut</li>
            <li>Add "Ask for Input" → prompt "What's the task?"</li>
            <li>Add "Get Contents of URL" → paste the URL above</li>
            <li>Method: POST, body JSON: <code className="bg-gray-100 px-1 rounded">{`{"token":"${family?.invite_code}","text":"[Provided Input]"}`}</code></li>
            <li>Name it "Add family task" → use with "Hey Siri, add family task"</li>
          </ol>
        </details>
      </section>
    </div>
  )
}
