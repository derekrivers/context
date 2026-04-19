import { describe, expect, it } from 'vitest'
import {
  CanonicalSpecSchema,
  EntitySchema,
  ExtensionsSchema,
  UnresolvedQuestionSchema,
} from '../src/schema.js'
import {
  fixtureComplete,
  fixtureEmpty,
  fixtureIntentOnly,
  fixtureWithEntities,
} from './fixtures.js'

describe('CanonicalSpecSchema', () => {
  it('accepts an empty draft spec', () => {
    expect(CanonicalSpecSchema.safeParse(fixtureEmpty()).success).toBe(true)
  })

  it('accepts a partially filled spec', () => {
    expect(CanonicalSpecSchema.safeParse(fixtureIntentOnly()).success).toBe(true)
    expect(CanonicalSpecSchema.safeParse(fixtureWithEntities()).success).toBe(true)
  })

  it('accepts a fully filled spec', () => {
    expect(CanonicalSpecSchema.safeParse(fixtureComplete()).success).toBe(true)
  })

  it('rejects an unknown top-level key', () => {
    const bad = { ...fixtureEmpty(), rogue: true } as unknown
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects wrong schema_version', () => {
    const bad = { ...fixtureEmpty(), schema_version: '9.9' } as unknown
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a non-uuid id', () => {
    const bad = { ...fixtureEmpty(), id: 'not-a-uuid' }
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an empty title', () => {
    const bad = { ...fixtureEmpty(), title: '' }
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown status', () => {
    const bad = { ...fixtureEmpty(), status: 'frozen' } as unknown
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a malformed created_at', () => {
    const bad = { ...fixtureEmpty(), created_at: 'yesterday' }
    expect(CanonicalSpecSchema.safeParse(bad).success).toBe(false)
  })
})

describe('EntitySchema', () => {
  it('rejects a non-slug id', () => {
    const bad = { id: 'Not A Slug', name: 'X', fields: [] }
    expect(EntitySchema.safeParse(bad).success).toBe(false)
  })

  it('accepts snake_case and kebab-case slugs', () => {
    expect(
      EntitySchema.safeParse({ id: 'todo_item', name: 'Todo item', fields: [] }).success,
    ).toBe(true)
    expect(
      EntitySchema.safeParse({ id: 'todo-item', name: 'Todo item', fields: [] }).success,
    ).toBe(true)
  })

  it('rejects a field with an empty type', () => {
    const bad = { id: 'todo', name: 'Todo', fields: [{ name: 'title', type: '' }] }
    expect(EntitySchema.safeParse(bad).success).toBe(false)
  })
})

describe('ExtensionsSchema', () => {
  it('accepts a namespaced key', () => {
    const r = ExtensionsSchema.safeParse({ 'reddwarf:project_spec': { any: 'thing' } })
    expect(r.success).toBe(true)
  })

  it('rejects a key without a namespace', () => {
    const r = ExtensionsSchema.safeParse({ project_spec: {} })
    expect(r.success).toBe(false)
  })

  it('rejects an uppercase namespace', () => {
    const r = ExtensionsSchema.safeParse({ 'RedDwarf:project_spec': {} })
    expect(r.success).toBe(false)
  })
})

describe('UnresolvedQuestionSchema', () => {
  it('accepts a pending question', () => {
    const r = UnresolvedQuestionSchema.safeParse({
      id: 'q1',
      path: 'intent.problem',
      reason: 'user has not clarified yet',
      state: 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty reason', () => {
    const r = UnresolvedQuestionSchema.safeParse({
      id: 'q1',
      path: 'intent.problem',
      reason: '',
      state: 'unanswerable',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(r.success).toBe(false)
  })
})
