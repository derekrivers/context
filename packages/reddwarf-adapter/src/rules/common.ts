import type { TranslationNote, TranslationNoteKind, TranslationNoteSeverity } from '../types.js'

/** A named section block that will be assembled into `ProjectSpec.summary`. */
export interface SummaryBlock {
  /** Machine-parseable heading the Architect can key off, e.g. `## Capabilities`. */
  heading: string
  /** Multi-line body. Preserve literal newlines. */
  body: string
  /** Priority used when truncating to stay under the summary cap.
   * Higher = keep; 100 = non-goals/problem, 10 = references. */
  keepPriority: number
  /** Canonical path for translation-note bookkeeping. */
  canonicalPath: string
}

export function isUnknownValue(v: unknown): v is { unknown: true; reason: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { unknown?: unknown }).unknown === true &&
    typeof (v as { reason?: unknown }).reason === 'string'
  )
}

export function note(
  kind: TranslationNoteKind,
  canonicalPath: string,
  projectSpecPath: string | null,
  reason: string,
  severity: TranslationNoteSeverity = 'info',
): TranslationNote {
  return { kind, canonicalPath, projectSpecPath, reason, severity }
}

export function compareNotes(a: TranslationNote, b: TranslationNote): number {
  if (a.severity !== b.severity) return a.severity === 'warning' ? -1 : 1
  return a.canonicalPath < b.canonicalPath ? -1 : a.canonicalPath > b.canonicalPath ? 1 : 0
}
