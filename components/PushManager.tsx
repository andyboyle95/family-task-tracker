'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'

export function PushManager() {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'denied' | 'granted' | 'default'>('loading')

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus(Notification.permission as 'denied' | 'granted' | 'default')
  }, [])

  async function enableNotifications() {
    try {
      const permission = await Notification.requestPermission()
      setStatus(permission as 'denied' | 'granted' | 'default')
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) { await registerSubscription(existing); return }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
      })
      await registerSubscription(sub)
    } catch (err) {
      console.error('Push subscription failed', err)
    }
  }

  async function registerSubscription(sub: PushSubscription) {
    const json = sub.toJSON()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    })
  }

  if (status === 'loading' || status === 'unsupported') return null

  if (status === 'granted') {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
        <Bell size={16} />
        Notifications on
      </div>
    )
  }

  return (
    <button
      onClick={enableNotifications}
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
    >
      {status === 'denied' ? <BellOff size={16} /> : <Bell size={16} />}
      {status === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
    </button>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}
