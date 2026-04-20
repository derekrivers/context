import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/lib/time.js'

function ago(ms: number, now = new Date('2026-04-19T12:00:00Z')): string {
  const then = new Date(now.getTime() - ms).toISOString()
  return relativeTime(then, now)
}

describe('relativeTime', () => {
  const now = new Date('2026-04-19T12:00:00Z')

  it('returns "just now" for very recent timestamps', () => {
    expect(ago(5_000, now)).toBe('just now')
  })

  it('pluralises minutes correctly', () => {
    expect(ago(60_000, now)).toBe('1 minute ago')
    expect(ago(5 * 60_000, now)).toBe('5 minutes ago')
  })

  it('switches to hours past an hour', () => {
    expect(ago(2 * 60 * 60_000, now)).toBe('2 hours ago')
  })

  it('switches to days past a day', () => {
    expect(ago(2 * 24 * 60 * 60_000, now)).toBe('2 days ago')
  })

  it('switches to weeks past 7 days', () => {
    expect(ago(14 * 24 * 60 * 60_000, now)).toBe('2 weeks ago')
  })

  it('falls back to a locale date past 6 weeks', () => {
    const out = ago(90 * 24 * 60 * 60_000, now)
    expect(out).not.toMatch(/ago/)
  })
})
