import { describe, expect, it } from 'vitest'
import { computeDiff } from '../src/lib/diff.js'

describe('computeDiff', () => {
  it('returns no changes for deep-equal values', () => {
    const a = { intent: { summary: 'x' }, tags: ['a', 'b'] }
    const b = { intent: { summary: 'x' }, tags: ['a', 'b'] }
    expect(computeDiff(a, b).changes).toEqual([])
  })

  it('records a leaf scalar change at a dotted path', () => {
    const a = { intent: { summary: 'old' } }
    const b = { intent: { summary: 'new' } }
    expect(computeDiff(a, b).changes).toEqual([
      { path: 'intent.summary', before: 'old', after: 'new' },
    ])
  })

  it('records added and removed keys', () => {
    const a = { intent: { summary: 'x' } }
    const b = { intent: { summary: 'x', problem: 'p' } }
    expect(computeDiff(a, b).changes).toEqual([
      { path: 'intent.problem', before: undefined, after: 'p' },
    ])
  })

  it('treats arrays as opaque single values', () => {
    const a = { users: [{ id: 'a1' }] }
    const b = { users: [{ id: 'a1' }, { id: 'a2' }] }
    const d = computeDiff(a, b)
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]?.path).toBe('users')
    expect(d.changes[0]?.before).toEqual([{ id: 'a1' }])
    expect(d.changes[0]?.after).toEqual([{ id: 'a1' }, { id: 'a2' }])
  })

  it('handles type changes (object -> scalar)', () => {
    const a = { x: { y: 1 } }
    const b = { x: 'hello' }
    expect(computeDiff(a, b).changes).toEqual([
      { path: 'x', before: { y: 1 }, after: 'hello' },
    ])
  })

  it('records root change when both sides are non-objects', () => {
    expect(computeDiff(1, 2).changes).toEqual([{ path: '$', before: 1, after: 2 }])
  })

  it('does not recurse into equal subtrees', () => {
    const a = { a: { deep: { k: 1 } }, b: 'x' }
    const b = { a: { deep: { k: 1 } }, b: 'y' }
    expect(computeDiff(a, b).changes).toEqual([{ path: 'b', before: 'x', after: 'y' }])
  })
})
