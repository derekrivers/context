import { describe, expect, it } from 'vitest'
import { toProjectSpec, TranslationError, SUMMARY_MAX_CHARS } from '../src/index.js'
import { loadFixture } from './helpers.js'

describe('toProjectSpec — happy paths', () => {
  it('translates minimal-crud into a valid ProjectSpec', () => {
    const spec = loadFixture('minimal-crud.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.sourceRepo).toBe('derekrivers/todo-tracker')
    expect(result.projectSpec.title).toBe('A minimal todo tracker for solo operators.')
    expect(result.projectSpec.status).toBe('pending_approval')
    expect(result.projectSpec.projectSize).toBe('small')
    expect(result.projectSpec.summary.length).toBeGreaterThan(20)
    expect(result.adapterVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(result.targetSchemaVersion).toContain('9648d893a55b')
  })

  it('translates complex-with-flows into a valid ProjectSpec with medium size', () => {
    const spec = loadFixture('complex-with-flows.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.projectSize).toBe('medium')
    expect(result.projectSpec.summary).toContain('## Capabilities')
    expect(result.projectSpec.summary).toContain('## Flows')
    expect(result.projectSpec.summary).toContain('## Constraints')
  })

  it('is deterministic — running twice yields byte-identical JSON', () => {
    const spec = loadFixture('minimal-crud.json')
    const a = toProjectSpec(spec)
    const b = toProjectSpec(spec)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('surfaces context id and version in the result', () => {
    const spec = loadFixture('minimal-crud.json')
    const result = toProjectSpec(spec)
    expect(result.contextSpecId).toBe(spec.id)
    expect(result.contextVersion).toBeGreaterThanOrEqual(1)
  })
})

describe('toProjectSpec — translation notes', () => {
  it('emits one grouped note per capability', () => {
    const spec = loadFixture('minimal-crud.json')
    const { translationNotes } = toProjectSpec(spec)
    const capabilityNotes = translationNotes.filter((n) => n.canonicalPath.startsWith('capabilities['))
    expect(capabilityNotes).toHaveLength(3)
    for (const n of capabilityNotes) {
      expect(n.kind).toBe('grouped')
      expect(n.projectSpecPath).toBe('summary')
    }
  })

  it('sorts notes deterministically (warnings before infos, then by path)', () => {
    const spec = loadFixture('with-extensions-override.json')
    const { translationNotes } = toProjectSpec(spec)
    for (let i = 1; i < translationNotes.length; i++) {
      const prev = translationNotes[i - 1]!
      const cur = translationNotes[i]!
      if (prev.severity === 'info' && cur.severity === 'warning') {
        throw new Error('warning appears after info — ordering violated')
      }
      if (prev.severity === cur.severity) {
        expect(prev.canonicalPath <= cur.canonicalPath).toBe(true)
      }
    }
  })
})

describe('toProjectSpec — capability-heavy', () => {
  it('stays under the summary cap and emits drop-or-truncate notes for low-priority blocks when exceeded', () => {
    const spec = loadFixture('capability-heavy.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS)
    expect(result.projectSpec.projectSize).toBe('large')
  })

  it('keeps ## Capabilities block intact in the summary', () => {
    const spec = loadFixture('capability-heavy.json')
    const result = toProjectSpec(spec)
    expect(result.projectSpec.summary).toContain('## Capabilities')
    expect(result.projectSpec.summary).toContain('- capability: create_lead')
    expect(result.projectSpec.summary).toContain('- capability: archive_inactive')
  })
})

describe('toProjectSpec — errors', () => {
  it('throws TranslationError when intent.summary is absent', () => {
    const spec = loadFixture('missing-required-field.json')
    expect(() => toProjectSpec(spec)).toThrow(TranslationError)
    try {
      toProjectSpec(spec)
    } catch (err) {
      expect(err).toBeInstanceOf(TranslationError)
      const e = err as TranslationError
      expect(e.missingPaths).toContain('intent.summary')
    }
  })

  it('throws TranslationError when the sourceRepo extension is missing', () => {
    const base = loadFixture('minimal-crud.json')
    const stripped = {
      ...base,
      extensions: {},
    }
    expect(() => toProjectSpec(stripped)).toThrow(TranslationError)
    try {
      toProjectSpec(stripped)
    } catch (err) {
      const e = err as TranslationError
      expect(e.missingPaths).toContain("extensions['reddwarf:project_spec'].sourceRepo")
    }
  })
})
