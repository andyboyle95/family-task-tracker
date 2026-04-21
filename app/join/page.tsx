'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile, Family } from '@/types'

type Step = 'entry' | 'pick-user' | 'new-user' | 'create-family'

interface FamilyData {
  family: Family
  members: Profile[]
}

export default function JoinPage() {
  const [step, setStep] = useState<Step>('entry')
  const [tab, setTab] = useState<'join' | 'create'>('join')

  // Join flow
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [familyData, setFamilyData] = useState<FamilyData | null>(null)

  // New member flow
  const [newName, setNewName] = useState('')
  const [newNameLoading, setNewNameLoading] = useState(false)

  // Create family flow
  const [familyName, setFamilyName] = useState('')
  const [yourName, setYourName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const router = useRouter()

  async function setSession(userId: string, familyId: string, userName: string) {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, familyId, userName }),
    })
    router.push('/')
    router.refresh()
  }

  async function lookupCode() {
    if (code.length < 6) return
    setCodeError('')
    setCodeLoading(true)
    const res = await fetch(`/api/families/${code}`)
    if (!res.ok) { setCodeError('Invalid invite code — check with your family admin.'); setCodeLoading(false); return }
    const data: FamilyData = await res.json()
    setFamilyData(data)
    setStep('pick-user')
    setCodeLoading(false)
  }

  async function selectUser(member: Profile) {
    await setSession(member.id, familyData!.family.id, member.name)
  }

  async function addNewMember() {
    if (!newName.trim()) return
    setNewNameLoading(true)
    const res = await fetch(`/api/families/${familyData!.family.invite_code}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (!res.ok) { setNewNameLoading(false); return }
    const profile: Profile = await res.json()
    await setSession(profile.id, familyData!.family.id, profile.name)
  }

  async function createFamily() {
    if (!familyName.trim() || !yourName.trim()) return
    setCreateError('')
    setCreateLoading(true)
    const res = await fetch('/api/families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyName: familyName.trim(), yourName: yourName.trim() }),
    })
    if (!res.ok) { setCreateError('Could not create family. Try again.'); setCreateLoading(false); return }
    const { family, profile } = await res.json()
    await setSession(profile.id, family.id, profile.name)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-gray-900">Family Tasks</h1>
        </div>

        {/* ── STEP: code entry / create toggle ─────────────────── */}
        {step === 'entry' && (
          <>
            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              {(['join', 'create'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {t === 'join' ? 'Join family' : 'New family'}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              {tab === 'join' ? (
                <>
                  {codeError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                      {codeError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invite code</label>
                    <input
                      type="text" value={code} maxLength={6}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && lookupCode()}
                      placeholder="A1B2C3"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl text-center tracking-widest font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-xs text-gray-400 mt-1 text-center">Get this from your family admin</p>
                  </div>
                  <button onClick={lookupCode} disabled={code.length < 6 || codeLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                    {codeLoading ? 'Looking up…' : 'Continue →'}
                  </button>
                </>
              ) : (
                <>
                  {createError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                      {createError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Family name</label>
                    <input type="text" value={familyName} onChange={e => setFamilyName(e.target.value)}
                      placeholder="e.g. The Smiths"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                    <input type="text" value={yourName} onChange={e => setYourName(e.target.value)}
                      placeholder="e.g. Sarah"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <button onClick={createFamily} disabled={!familyName.trim() || !yourName.trim() || createLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                    {createLoading ? 'Creating…' : 'Create family'}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ── STEP: pick who you are ────────────────────────────── */}
        {step === 'pick-user' && familyData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{familyData.family.name}</h2>
            <p className="text-sm text-gray-500 mb-6">Who are you?</p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {familyData.members.map(member => (
                <button key={member.id} onClick={() => selectUser(member)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-indigo-50 active:scale-95 transition-all">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                    style={{ backgroundColor: member.avatar_color }}>
                    {member.name[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-700 text-center leading-tight">{member.name}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setStep('new-user')}
              className="w-full text-sm text-indigo-600 hover:text-indigo-700 py-2 border border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 transition-colors">
              + I&apos;m not listed — add me
            </button>

            <button onClick={() => setStep('entry')}
              className="w-full text-xs text-gray-400 hover:text-gray-600 mt-2 py-1">
              ← Back
            </button>
          </div>
        )}

        {/* ── STEP: add new member ──────────────────────────────── */}
        {step === 'new-user' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Add yourself</h2>
              <p className="text-sm text-gray-500">Enter your name to join {familyData?.family.name}</p>
            </div>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={addNewMember} disabled={!newName.trim() || newNameLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
              {newNameLoading ? 'Joining…' : 'Join family'}
            </button>
            <button onClick={() => setStep('pick-user')}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
              ← Back
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
