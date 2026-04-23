'use client'

import { useState, useRef } from 'react'
import { Mic, MicOff, Sparkles, X, Loader2, Check, Trash2 } from 'lucide-react'
import type { Profile } from '@/types'

interface ParsedItem {
  description: string
  person_id: string
  person_name: string
  points: number
  completed_at?: string
  reasoning: string
}

interface Props {
  members: Profile[]
  onClose: () => void
  onSaved: () => void
}

export function LogWorkModal({ members, onClose, onSaved }: Props) {
  const [text, setText]         = useState('')
  const [listening, setListening] = useState(false)
  const [parsing, setParsing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [items, setItems]       = useState<ParsedItem[] | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const recognitionRef = useRef<unknown>(null)

  const canRecord =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  function toggleListening() {
    if (listening) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(recognitionRef.current as any)?.stop()
      setListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-GB'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as unknown[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('')
      setText(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    recognition.onend  = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  async function handleParse() {
    if (!text.trim()) return
    setParsing(true)
    setError(null)
    setItems(null)

    const res = await fetch('/api/ai/log-work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (res.ok) {
      setItems(await res.json())
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not parse — try rephrasing')
    }
    setParsing(false)
  }

  async function handleConfirm() {
    if (!items?.length) return
    setSaving(true)
    setError(null)

    const res = await fetch('/api/tasks/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })

    if (res.ok) {
      onSaved()
      onClose()
    } else {
      setError('Failed to save — try again')
      setSaving(false)
    }
  }

  function updateField(index: number, field: 'description' | 'points' | 'person_id' | 'completed_at', value: string | number) {
    setItems(prev => prev?.map((item, i) => {
      if (i !== index) return item
      if (field === 'person_id') {
        const member = members.find(m => m.id === value)
        return { ...item, person_id: value as string, person_name: member?.name ?? item.person_name }
      }
      return { ...item, [field]: value }
    }) ?? null)
  }

  function removeItem(index: number) {
    setItems(prev => prev?.filter((_, i) => i !== index) ?? null)
  }

  const totalPoints = items?.reduce((s, i) => s + i.points, 0) ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Log what you did</h2>
            <p className="text-xs text-gray-400 mt-0.5">AI awards points — 10 pts ≈ 30 min of work</p>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-4">

          {/* ── Input step ── */}
          {!items && (
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={'e.g. "I did the bottles and bath, Andy cooked dinner and cleaned up after"'}
                  rows={5}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 pr-12 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {canRecord && (
                  <button
                    onClick={toggleListening}
                    className={`absolute bottom-3 right-3 p-2 rounded-xl transition-all ${
                      listening
                        ? 'bg-red-100 text-red-500 animate-pulse'
                        : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-50'
                    }`}
                    title={listening ? 'Stop recording' : 'Tap to speak'}
                  >
                    {listening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
              </div>

              {listening && (
                <p className="text-xs text-red-500 text-center animate-pulse">🎙 Listening…</p>
              )}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleParse}
                disabled={!text.trim() || parsing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all"
              >
                {parsing
                  ? <><Loader2 size={16} className="animate-spin" /> Parsing…</>
                  : <><Sparkles size={16} /> Parse with AI</>}
              </button>
            </div>
          )}

          {/* ── Preview / edit step ── */}
          {items && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Review & edit ({items.length} task{items.length !== 1 ? 's' : ''})
                </p>
                <button onClick={() => { setItems(null); setError(null) }}
                  className="text-xs text-indigo-500 hover:underline">
                  ← Edit text
                </button>
              </div>

              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  No tasks found — go back and try rephrasing
                </p>
              )}

              {items.map((item, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2.5">
                  {/* Title */}
                  <div className="flex items-center gap-2">
                    <input
                      value={item.description}
                      onChange={e => updateField(i, 'description', e.target.value)}
                      className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-b border-gray-200 focus:border-indigo-400 focus:outline-none pb-0.5"
                    />
                    <button onClick={() => removeItem(i)}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Person + Points */}
                  <div className="flex items-center gap-2">
                    <select
                      value={item.person_id}
                      onChange={e => updateField(i, 'person_id', e.target.value)}
                      className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 shrink-0">
                      <span className="text-xs text-amber-500">+</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={item.points}
                        onChange={e => updateField(i, 'points', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 text-xs font-bold text-amber-700 bg-transparent focus:outline-none text-center"
                      />
                      <span className="text-xs text-amber-600">pts</span>
                    </div>
                  </div>

                  {/* Date override */}
                  {item.completed_at && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">Date:</span>
                      <input
                        type="date"
                        value={item.completed_at.split('T')[0]}
                        onChange={e => updateField(i, 'completed_at', e.target.value ? `${e.target.value}T12:00:00.000Z` : '')}
                        className="text-[10px] text-gray-600 bg-transparent border-b border-gray-200 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 italic leading-relaxed">{item.reasoning}</p>
                </div>
              ))}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
              )}

              {items.length > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  {saving
                    ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                    : <><Check size={16} /> Confirm &amp; Award {totalPoints} pts</>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
