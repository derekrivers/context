import { describe, expect, it } from 'vitest'
import { toProjectSpec } from '../src/index.js'
import { loadFixture } from './helpers.js'

describe('extensions overrides', () => {
  it('extension values override inferred values, never the reverse', () => {
    const spec = loadFixture('with-extensions-override.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.title).toBe('Operator surface (overridden)')
    expect(result.projectSpec.projectSize).toBe('medium')
    expect(result.projectSpec.sourceIssueId).toBe('gh-123')
  })

  it('unknown extension keys are dropped with a warning note, not a crash', () => {
    const spec = loadFixture('with-extensions-override.json')
    const result = toProjectSpec(spec)
    const bogus = result.translationNotes.find(
      (n) => n.canonicalPath === "extensions['reddwarf:project_spec'].bogusField",
    )
    expect(bogus).toBeDefined()
    expect(bogus?.kind).toBe('dropped')
    expect(bogus?.severity).toBe('warning')
  })

  it('every applied override produces an inferred note citing the extension path', () => {
    const spec = loadFixture('with-extensions-override.json')
    const result = toProjectSpec(spec)
    const applied = result.translationNotes.filter(
      (n) =>
        n.canonicalPath.startsWith("extensions['reddwarf:project_spec']") && n.kind === 'inferred',
    )
    const appliedFields = applied.map((n) => n.projectSpecPath)
    expect(appliedFields).toContain('sourceRepo')
    expect(appliedFields).toContain('title')
    expect(appliedFields).toContain('projectSize')
    expect(appliedFields).toContain('sourceIssueId')
  })
})
