import { describe, expect, it } from 'vitest'
import { createEmptySpec } from '../src/factory.js'
import { CanonicalSpecSchema } from '../src/schema.js'

describe('createEmptySpec', () => {
  it('produces a schema-valid draft spec', () => {
    const spec = createEmptySpec({
      title: 'My first spec',
      author: { id: 'derek', name: 'Derek' },
    })
    const r = CanonicalSpecSchema.safeParse(spec)
    expect(r.success).toBe(true)
  })

  it('uses the provided clock and id when given', () => {
    const fixed = new Date('2026-04-19T12:00:00.000Z')
    const spec = createEmptySpec({
      title: 'Fixed',
      author: { id: 'derek' },
      id: '22222222-2222-4222-8222-222222222222',
      now: () => fixed,
    })
    expect(spec.id).toBe('22222222-2222-4222-8222-222222222222')
    expect(spec.created_at).toBe(fixed.toISOString())
    expect(spec.updated_at).toBe(fixed.toISOString())
  })

  it('defaults status to draft and sections to empty structures', () => {
    const spec = createEmptySpec({ title: 'X', author: { id: 'derek' } })
    expect(spec.status).toBe('draft')
    expect(spec.domain_model.entities).toEqual([])
    expect(spec.capabilities).toEqual([])
    expect(spec.flows).toEqual([])
    expect(spec.references).toEqual([])
    expect(spec.provenance.unresolved_questions).toEqual([])
    expect(spec.provenance.authors).toEqual([{ id: 'derek' }])
  })
})
