import { describe, expect, it } from 'vitest'
import { computeCompleteness } from '../src/completeness.js'
import {
  fixtureComplete,
  fixtureEmpty,
  fixtureIntentOnly,
  fixtureWithEntities,
} from './fixtures.js'

describe('computeCompleteness', () => {
  it('scores an empty spec at 0 overall', () => {
    const r = computeCompleteness(fixtureEmpty())
    expect(r.overall).toBe(0)
    expect(r.nextField).not.toBeNull()
    expect(r.nextField?.section).toBe('intent')
  })

  it('scores a fully filled spec at 1 overall', () => {
    const r = computeCompleteness(fixtureComplete())
    expect(r.overall).toBe(1)
    expect(r.nextField).toBeNull()
    expect(r.missingPrioritized).toEqual([])
  })

  it('picks intent.summary as the first field for an empty spec', () => {
    const r = computeCompleteness(fixtureEmpty())
    expect(r.nextField?.path).toBe('intent.summary')
  })

  it('advances to domain_model once intent is filled', () => {
    const r = computeCompleteness(fixtureIntentOnly())
    expect(r.bySection.intent.score).toBe(1)
    expect(r.nextField?.path).toBe('domain_model.entities')
  })

  it('blocks capabilities until at least one entity exists', () => {
    const r = computeCompleteness(fixtureIntentOnly())
    const capabilities = r.missingPrioritized.find((m) => m.path === 'capabilities')
    expect(capabilities?.blocked).toBe(true)
  })

  it('unblocks capabilities once an entity is added', () => {
    const r = computeCompleteness(fixtureWithEntities())
    const capabilities = r.missingPrioritized.find((m) => m.path === 'capabilities')
    expect(capabilities?.blocked).toBe(false)
  })

  it('orders missing fields by importance then section priority, blocked last', () => {
    const r = computeCompleteness(fixtureEmpty())
    const unblocked = r.missingPrioritized.filter((m) => !m.blocked)
    const blocked = r.missingPrioritized.filter((m) => m.blocked)
    expect([...unblocked, ...blocked]).toEqual(r.missingPrioritized)

    const firstHigh = unblocked.findIndex((m) => m.importance === 'high')
    const firstLow = unblocked.findIndex((m) => m.importance === 'low')
    if (firstHigh !== -1 && firstLow !== -1) {
      expect(firstHigh).toBeLessThan(firstLow)
    }
  })

  it('treats unanswerable questions as resolved for scoring', () => {
    const spec = fixtureEmpty()
    spec.provenance.unresolved_questions.push({
      id: 'q1',
      path: 'intent.summary',
      reason: 'user explicitly declined to summarise',
      state: 'unanswerable',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    const r = computeCompleteness(spec)
    const stillMissing = r.missingPrioritized.find((m) => m.path === 'intent.summary')
    expect(stillMissing).toBeUndefined()
  })

  it('does not treat pending questions as resolved', () => {
    const spec = fixtureEmpty()
    spec.provenance.unresolved_questions.push({
      id: 'q1',
      path: 'intent.summary',
      reason: 'asked but no answer yet',
      state: 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    const r = computeCompleteness(spec)
    const stillMissing = r.missingPrioritized.find((m) => m.path === 'intent.summary')
    expect(stillMissing).toBeDefined()
  })

  it('scores each section between 0 and 1 inclusive', () => {
    const r = computeCompleteness(fixtureIntentOnly())
    for (const section of Object.values(r.bySection)) {
      expect(section.score).toBeGreaterThanOrEqual(0)
      expect(section.score).toBeLessThanOrEqual(1)
    }
  })
})
