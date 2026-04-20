import { describe, expect, it } from 'vitest'
import { toProjectSpec } from '../src/index.js'
import { loadFixture } from './helpers.js'

describe('unknown handling', () => {
  it('discards provenance.unresolved_questions entirely — they are Context-internal', () => {
    const spec = loadFixture('with-unknowns.json')
    const result = toProjectSpec(spec)
    // provenance is not part of the output at all
    expect(result.projectSpec.summary).not.toContain('unresolved')
    expect(result.projectSpec.summary).not.toContain('q_auth')
  })

  it('still translates the rest of the spec without crashing', () => {
    const spec = loadFixture('with-unknowns.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.title).toBe('Exploratory feature-flag service.')
    expect(result.projectSpec.projectSize).toBe('small')
  })
})

describe('inline {unknown,reason} values on scalar fields', () => {
  it('drops intent.problem and emits a dropped note when value is {unknown,reason}', () => {
    const base = loadFixture('minimal-crud.json')
    const spec = {
      ...base,
      intent: {
        ...base.intent,
        problem: { unknown: true, reason: 'business scope unclear' } as unknown as string,
      },
    }
    // We deliberately bypass the spec-schema parse here — this tests the
    // adapter's defensive handling of legacy inline-unknown values that
    // may leak in from older editors before the schema was tightened.
    const result = toProjectSpec(spec)
    expect(result.projectSpec.summary).not.toContain('## Problem')
    const dropped = result.translationNotes.find((n) => n.canonicalPath === 'intent.problem')
    expect(dropped?.kind).toBe('dropped')
  })
})
