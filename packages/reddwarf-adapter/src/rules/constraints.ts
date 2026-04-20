import type { CanonicalSpec } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { isUnknownValue, note, type SummaryBlock } from './common.js'

export interface ConstraintsResult {
  block: SummaryBlock | null
  notes: TranslationNote[]
}

export function translateConstraints(spec: CanonicalSpec): ConstraintsResult {
  const c = spec.constraints
  const notes: TranslationNote[] = []
  const lines: string[] = []

  const scalar = (key: keyof typeof c, label: string): void => {
    const raw = c[key]
    if (isUnknownValue(raw)) {
      notes.push(
        note(
          'dropped',
          `constraints.${String(key)}`,
          'summary',
          `Marked unknown: ${raw.reason}.`,
        ),
      )
      return
    }
    if (typeof raw === 'string' && raw.length > 0) {
      lines.push(`- ${label}: ${raw.replace(/\s+/g, ' ').trim()}`)
    }
  }

  scalar('platform', 'platform')

  if (c.stack && !isUnknownValue(c.stack)) {
    const parts: string[] = []
    if (c.stack.frontend) parts.push(`frontend=${c.stack.frontend}`)
    if (c.stack.backend) parts.push(`backend=${c.stack.backend}`)
    if (c.stack.database) parts.push(`database=${c.stack.database}`)
    if (c.stack.notes) parts.push(`notes=${c.stack.notes}`)
    if (parts.length > 0) lines.push(`- stack: ${parts.join('; ')}`)
  } else if (isUnknownValue(c.stack)) {
    notes.push(note('dropped', 'constraints.stack', 'summary', `Marked unknown: ${c.stack.reason}.`))
  }

  scalar('auth', 'auth')
  scalar('data_retention', 'data_retention')
  scalar('performance', 'performance')
  scalar('compliance', 'compliance')
  scalar('deploy_posture', 'deploy_posture')

  if (lines.length === 0) return { block: null, notes }

  notes.push(
    note(
      'grouped',
      'constraints',
      'summary',
      'Constraints folded into ProjectSpec.summary under "## Constraints". RedDwarf has no first-class constraints field on ProjectSpec.',
    ),
  )

  return {
    block: {
      heading: '## Constraints',
      body: lines.join('\n'),
      keepPriority: 80,
      canonicalPath: 'constraints',
    },
    notes,
  }
}
