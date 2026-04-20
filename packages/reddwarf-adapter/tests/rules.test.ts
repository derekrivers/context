import { describe, expect, it } from 'vitest'
import { translateIntent } from '../src/rules/intent.js'
import { translateCapabilities } from '../src/rules/capabilities.js'
import { translateFlows } from '../src/rules/flows.js'
import { translateConstraints } from '../src/rules/constraints.js'
import { translateReferences } from '../src/rules/references.js'
import { translateDomainModel } from '../src/rules/domain_model.js'
import { loadFixture } from './helpers.js'

describe('rules/intent', () => {
  it('extracts title, problem block, users block, non-goals', () => {
    const spec = loadFixture('minimal-crud.json')
    const out = translateIntent(spec)
    expect(out.title).toBe('A minimal todo tracker for solo operators.')
    expect(out.problemBlock?.heading).toBe('## Problem')
    expect(out.usersBlock?.body).toContain('- operator: Solo operator')
    expect(out.nonGoalsBlock?.body).toContain('- Team collaboration.')
  })

  it('returns null title when summary is absent', () => {
    const spec = loadFixture('missing-required-field.json')
    const out = translateIntent(spec)
    expect(out.title).toBeNull()
  })
})

describe('rules/capabilities', () => {
  it('produces a machine-parseable ## Capabilities block with verb/name/entity_ref keys', () => {
    const spec = loadFixture('minimal-crud.json')
    const out = translateCapabilities(spec)
    expect(out.capabilityCount).toBe(3)
    expect(out.block?.heading).toBe('## Capabilities')
    expect(out.block?.body).toContain('- capability: create_todo')
    expect(out.block?.body).toContain('  verb: create')
    expect(out.block?.body).toContain('  name: Create todo')
    expect(out.block?.body).toContain('  entity_ref: todo')
    expect(out.block?.body).toContain('  acceptance_criteria:')
    expect(out.block?.body).toContain('    - given: authenticated user')
  })

  it('emits one grouped note per capability', () => {
    const spec = loadFixture('complex-with-flows.json')
    const out = translateCapabilities(spec)
    expect(out.notes).toHaveLength(8)
    for (const n of out.notes) expect(n.kind).toBe('grouped')
  })
})

describe('rules/flows', () => {
  it('renders steps and failure_modes inline', () => {
    const spec = loadFixture('minimal-crud.json')
    const out = translateFlows(spec)
    expect(out.block?.body).toContain('- flow: add_first_todo')
    expect(out.block?.body).toContain('  steps:')
    expect(out.block?.body).toContain('      action: types a title and presses enter')
    expect(out.block?.body).toContain('  failure_modes:')
  })
})

describe('rules/constraints', () => {
  it('produces a concise key-colon list under ## Constraints', () => {
    const spec = loadFixture('complex-with-flows.json')
    const out = translateConstraints(spec)
    expect(out.block?.heading).toBe('## Constraints')
    expect(out.block?.body).toContain('- platform: web')
    expect(out.block?.body).toContain('- stack:')
    expect(out.block?.body).toContain('- compliance: SOC2 Type II')
  })

  it('returns null block when no constraints set', () => {
    const spec = loadFixture('missing-required-field.json')
    const out = translateConstraints(spec)
    expect(out.block).toBeNull()
  })
})

describe('rules/references', () => {
  it('formats each reference on its own line', () => {
    const spec = loadFixture('complex-with-flows.json')
    const out = translateReferences(spec)
    expect(out.block?.body).toContain('- Prior AP SOP: https://internal/wiki/ap-sop')
    expect(out.block?.body).toContain('Target integration.')
  })

  it('emits a grouped note per reference', () => {
    const spec = loadFixture('complex-with-flows.json')
    const out = translateReferences(spec)
    expect(out.notes).toHaveLength(2)
  })
})

describe('rules/domain_model', () => {
  it('emits an entities+relationships block with field detail', () => {
    const spec = loadFixture('minimal-crud.json')
    const out = translateDomainModel(spec)
    expect(out.block?.body).toContain('entities:')
    expect(out.block?.body).toContain('  - id: todo')
    expect(out.block?.body).toContain('    fields:')
    expect(out.block?.body).toContain('relationships:')
    expect(out.block?.body).toContain('kind=one_to_many')
  })

  it('returns null block when domain_model is empty', () => {
    const spec = loadFixture('missing-required-field.json')
    const out = translateDomainModel(spec)
    expect(out.block).toBeNull()
  })
})
