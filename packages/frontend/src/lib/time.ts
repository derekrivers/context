const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diff = now.getTime() - then.getTime()
  if (!Number.isFinite(diff)) return iso

  if (diff < 45_000) return 'just now'
  if (diff < HOUR) {
    const mins = Math.round(diff / MINUTE)
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (diff < WEEK) {
    const days = Math.round(diff / DAY)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  const weeks = Math.round(diff / WEEK)
  if (weeks < 6) return `${weeks} week${weeks === 1 ? '' : 's'} ago`

  return then.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
