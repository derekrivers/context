import type { ProjectSpec } from './reddwarf-types.js'

export type TranslationNoteKind =
  | 'dropped'
  | 'inferred'
  | 'downgraded'
  | 'grouped'
  | 'coerced'

export type TranslationNoteSeverity = 'info' | 'warning'

export interface TranslationNote {
  kind: TranslationNoteKind
  canonicalPath: string
  projectSpecPath: string | null
  reason: string
  severity: TranslationNoteSeverity
}

export interface AdapterResult {
  projectSpec: ProjectSpec
  translationNotes: TranslationNote[]
  contextSpecId: string
  contextVersion: number
  adapterVersion: string
  targetSchemaVersion: string
}
