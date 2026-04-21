'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Family } from '@/types'

interface Props {
  profile: Profile
  family: Family
  members: Profile[]
  appUrl: string
}

export function SettingsClient({ profile, family, members, appUrl }: Props) {
  const [name, setName] = useState(profile.name)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function saveProfile() {
    setSaving(true)
    await supabase.from('profiles').update({ name }).eq('id', profile.id)
    setSaving(false)
    router.refresh()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const voiceWebhookUrl = `${appUrl}/api/voice`

  return (
    <div className="space-y-4">
      {/* Profile */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Your profile</h2>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Display name</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: profile.avatar_color }}>
            {profile.name[0].toUpperCase()}
          </div>
          <span>{profile.points.toLocaleString()} points total</span>
          <span className="text-gray-300">·</span>
          <span className="capitalize">{profile.role}</span>
        </div>
        <button onClick={saveProfile} disabled={saving || name === profile.name}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </section>

      {/* Family */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Family</h2>
        <p className="text-2xl font-bold text-indigo-600">{family.name}</p>

        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Invite code</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-lg tracking-widest text-center">
              {family.invite_code}
            </code>
            <button onClick={() => copyToClipboard(family.invite_code, 'code')}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
              {copied === 'code' ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-600" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Share this code with family members to join.</p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wide">Members ({members.length})</label>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: m.avatar_color }}>
                  {m.name[0].toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{m.name}</span>
                {m.id === profile.id && <span className="text-xs text-gray-400">(you)</span>}
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
          Use your family invite code as the <code className="bg-gray-100 px-1 rounded text-xs">token</code> in the webhook below.
          Works with Siri Shortcuts and IFTTT.
        </p>
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Webhook URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 break-all">
              {voiceWebhookUrl}
            </code>
            <button onClick={() => copyToClipboard(voiceWebhookUrl, 'webhook')}
              className="shrink-0 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
              {copied === 'webhook' ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-gray-600" />}
            </button>
          </div>
        </div>
        <details className="text-sm">
          <summary className="text-indigo-600 cursor-pointer hover:text-indigo-700 font-medium">
            Siri Shortcuts setup
          </summary>
          <ol className="mt-2 space-y-1 text-gray-600 list-decimal list-inside text-xs leading-relaxed">
            <li>Open Shortcuts app → New Shortcut</li>
            <li>Add "Ask for Input" action → prompt "What's the task?"</li>
            <li>Add "Get Contents of URL" action → paste the URL above</li>
            <li>Set method to POST, body to JSON: <code className="bg-gray-100 px-1 rounded">{`{"token":"${family.invite_code}","text":"[Provided Input]"}`}</code></li>
            <li>Name the shortcut "Add family task" → run with "Hey Siri, add family task"</li>
          </ol>
        </details>
      </section>

      {/* Sign out */}
      <button onClick={signOut}
        className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-600 bg-white border border-red-100 hover:border-red-200 rounded-2xl py-4 transition-colors font-medium">
        <LogOut size={18} />
        Sign out
      </button>
    </div>
  )
}
