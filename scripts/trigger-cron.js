// Called by the Railway cron service every hour
// Set APP_URL and CRON_SECRET as env vars on the cron service

const appUrl    = process.env.APP_URL
const cronSecret = process.env.CRON_SECRET

if (!appUrl || !cronSecret) {
  console.error('Missing APP_URL or CRON_SECRET')
  process.exit(1)
}

const res = await fetch(`${appUrl}/api/cron/reminders`, {
  headers: { Authorization: `Bearer ${cronSecret}` },
})

const body = await res.json()
console.log(`[${new Date().toISOString()}] cron/reminders →`, res.status, body)

if (!res.ok) process.exit(1)
