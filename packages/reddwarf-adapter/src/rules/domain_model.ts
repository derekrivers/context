import type { CanonicalSpec } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { note, type SummaryBlock } from './common.js'

export interface DomainModelResult {
  block: SummaryBlock | null
  notes: TranslationNote[]
}

export function translateDomainModel(spec: CanonicalSpec): DomainModelResult {
  const entities = spec.domain_model.entities
  const relationships = spec.domain_model.relationships
  const notes: TranslationNote[] = []
  if (entities.length === 0 && relationships.length === 0) {
    return { block: null, notes }
  }

  const lines: string[] = []
  if (entities.length > 0) {
    lines.push('entities:')
    for (const e of entities) {
      lines.push(`  - id: ${e.id}`)
      lines.push(`    name: ${e.name}`)
      if (e.description) {
        lines.push(`    description: ${e.description.replace(/\s+/g, ' ').trim()}`)
      }
      if (e.fields.length > 0) {
        lines.push('    fields:')
        for (const f of e.fields) {
          const parts = [`name=${f.name}`, `type=${f.type}`]
          if (f.required !== undefined) parts.push(`required=${f.required}`)
          if (f.description) parts.push(`description=${f.description.replace(/\s+/g, ' ').trim()}`)
          lines.push(`      - ${parts.join('; ')}`)
        }
      }
    }
  }

  if (relationships.length > 0) {
    lines.push('relationships:')
    for (const r of relationships) {
      const parts = [`id=${r.id}`, `from=${r.from_entity}`, `to=${r.to_entity}`, `kind=${r.kind}`]
      if (r.description) parts.push(`description=${r.description.replace(/\s+/g, ' ').trim()}`)
      lines.push(`  - ${parts.join('; ')}`)
    }
  }

  notes.push(
    note(
      'grouped',
      'domain_model',
      'summary',
      'Domain model folded into ProjectSpec.summary under "## Domain model". RedDwarf\'s Architect regenerates entity/relationship detail from this block.',
    ),
  )

  return {
    block: {
      heading: '## Domain model',
      body: lines.join('\n'),
      keepPriority: 85,
      canonicalPath: 'domain_model',
    },
    notes,
  }
}
