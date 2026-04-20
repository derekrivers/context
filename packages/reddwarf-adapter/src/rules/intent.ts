import type { CanonicalSpec, UserPersona } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { isUnknownValue, note, type SummaryBlock } from './common.js'

export interface IntentResult {
  title: string | null
  problemBlock: SummaryBlock | null
  usersBlock: SummaryBlock | null
  nonGoalsBlock: SummaryBlock | null
  notes: TranslationNote[]
}

const TITLE_MAX = 200

export function translateIntent(spec: CanonicalSpec): IntentResult {
  const notes: TranslationNote[] = []

  let title: string | null = null
  if (isUnknownValue(spec.intent.summary)) {
    notes.push(
      note(
        'dropped',
        'intent.summary',
        'title',
        `Marked unknown: ${spec.intent.summary.reason}. ProjectSpec.title is required; see TranslationError.`,
        'warning',
      ),
    )
  } else if (typeof spec.intent.summary === 'string' && spec.intent.summary.length > 0) {
    const raw = spec.intent.summary
    if (raw.length > TITLE_MAX) {
      notes.push(
        note(
          'coerced',
          'intent.summary',
          'title',
          `Truncated from ${raw.length} to ${TITLE_MAX} characters for ProjectSpec.title.`,
          'warning',
        ),
      )
      title = raw.slice(0, TITLE_MAX - 1).trimEnd() + '…'
    } else {
      title = raw
    }
  }

  let problemBlock: SummaryBlock | null = null
  if (isUnknownValue(spec.intent.problem)) {
    notes.push(
      note('dropped', 'intent.problem', 'summary', `Marked unknown: ${spec.intent.problem.reason}.`),
    )
  } else if (typeof spec.intent.problem === 'string' && spec.intent.problem.length > 0) {
    problemBlock = {
      heading: '## Problem',
      body: spec.intent.problem,
      keepPriority: 90,
      canonicalPath: 'intent.problem',
    }
  }

  let usersBlock: SummaryBlock | null = null
  if (Array.isArray(spec.intent.users) && spec.intent.users.length > 0) {
    usersBlock = {
      heading: '## Users',
      body: formatUsers(spec.intent.users),
      keepPriority: 60,
      canonicalPath: 'intent.users',
    }
    notes.push(
      note(
        'grouped',
        'intent.users',
        'summary',
        'Folded into ProjectSpec.summary under "## Users". RedDwarf has no first-class users field on ProjectSpec.',
      ),
    )
  }

  let nonGoalsBlock: SummaryBlock | null = null
  if (Array.isArray(spec.intent.non_goals) && spec.intent.non_goals.length > 0) {
    nonGoalsBlock = {
      heading: '## Non-goals',
      body: spec.intent.non_goals.map((g) => `- ${g}`).join('\n'),
      keepPriority: 40,
      canonicalPath: 'intent.non_goals',
    }
    notes.push(
      note(
        'grouped',
        'intent.non_goals',
        'summary',
        'Folded into ProjectSpec.summary under "## Non-goals". RedDwarf has no first-class non-goals field.',
      ),
    )
  }

  return { title, problemBlock, usersBlock, nonGoalsBlock, notes }
}

function formatUsers(users: UserPersona[]): string {
  return users
    .map((u) => {
      const needs = u.needs ? ` — needs: ${u.needs}` : ''
      return `- ${u.id}: ${u.persona}${needs}`
    })
    .join('\n')
}
