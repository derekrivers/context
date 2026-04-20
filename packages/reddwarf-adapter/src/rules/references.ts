import type { CanonicalSpec } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { note, type SummaryBlock } from './common.js'

export interface ReferencesResult {
  block: SummaryBlock | null
  notes: TranslationNote[]
}

export function translateReferences(spec: CanonicalSpec): ReferencesResult {
  const refs = spec.references
  const notes: TranslationNote[] = []
  if (refs.length === 0) return { block: null, notes }

  const lines: string[] = []
  refs.forEach((r, i) => {
    const note_ = r.notes ? ` — ${r.notes.replace(/\s+/g, ' ').trim()}` : ''
    lines.push(`- ${r.label}: ${r.url_or_path}${note_}`)
    notes.push(
      note(
        'grouped',
        `references[${i}]`,
        'summary',
        `Reference "${r.label}" folded into summary block "## References".`,
      ),
    )
  })

  return {
    block: {
      heading: '## References',
      body: lines.join('\n'),
      keepPriority: 10,
      canonicalPath: 'references',
    },
    notes,
  }
}
