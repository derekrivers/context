import type { CanonicalSpec } from '@context/spec-schema'
import { projectSpecSchema, type ProjectSpec } from '../reddwarf-types.js'
import type { TranslationNote } from '../types.js'
import { note } from './common.js'

const EXTENSION_KEY = 'reddwarf:project_spec'

/** Fields on ProjectSpec the caller is allowed to pin via extensions. */
const PINNABLE_FIELDS = new Set<keyof ProjectSpec>([
  'projectId',
  'sourceRepo',
  'sourceIssueId',
  'title',
  'summary',
  'projectSize',
  'status',
  'complexityClassification',
  'approvalDecision',
  'decidedBy',
  'decisionSummary',
  'amendments',
  'clarificationQuestions',
  'clarificationAnswers',
  'clarificationRequestedAt',
  'createdAt',
  'updatedAt',
])

export interface ExtensionOverrides {
  overrides: Partial<ProjectSpec>
  notes: TranslationNote[]
}

export function readExtensionOverrides(spec: CanonicalSpec): ExtensionOverrides {
  const raw = spec.extensions?.[EXTENSION_KEY]
  const notes: TranslationNote[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { overrides: {}, notes }
  }
  const obj = raw as Record<string, unknown>
  const overrides: Partial<ProjectSpec> = {}

  for (const [k, v] of Object.entries(obj)) {
    if (!PINNABLE_FIELDS.has(k as keyof ProjectSpec)) {
      notes.push(
        note(
          'dropped',
          `extensions['${EXTENSION_KEY}'].${k}`,
          null,
          `Extension key "${k}" does not correspond to a ProjectSpec field; ignored.`,
          'warning',
        ),
      )
      continue
    }
    ;(overrides as Record<string, unknown>)[k] = v
    notes.push(
      note(
        'inferred',
        `extensions['${EXTENSION_KEY}'].${k}`,
        k,
        `Overridden by extensions['${EXTENSION_KEY}'].${k}`,
      ),
    )
  }

  return { overrides, notes }
}

export { EXTENSION_KEY }
export { projectSpecSchema }
