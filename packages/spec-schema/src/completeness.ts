import type { CanonicalSpec, UnresolvedQuestion } from './schema.js'
import {
  FIELD_META,
  IMPORTANCE_WEIGHT,
  SECTION_PRIORITY,
  type FieldMeta,
  type Importance,
  type SectionKey,
} from './meta.js'

export interface MissingField {
  path: string
  section: SectionKey
  importance: Importance
  description: string
  blocked: boolean
}

export interface SectionCompleteness {
  section: SectionKey
  score: number
  present: number
  total: number
}

export interface CompletenessReport {
  overall: number
  bySection: Record<SectionKey, SectionCompleteness>
  missingPrioritized: MissingField[]
  nextField: MissingField | null
}

function getValueAtPath(spec: CanonicalSpec, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = spec
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function isFieldPresent(spec: CanonicalSpec, meta: FieldMeta): boolean {
  const value = getValueAtPath(spec, meta.path)
  if (meta.kind === 'collection') {
    const min = meta.minElements ?? 1
    return Array.isArray(value) && value.length >= min
  }
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

function isMarkedUnanswerable(spec: CanonicalSpec, path: string): boolean {
  return spec.provenance.unresolved_questions.some(
    (q: UnresolvedQuestion) => q.path === path && q.state === 'unanswerable',
  )
}

function areDependenciesSatisfied(spec: CanonicalSpec, meta: FieldMeta): boolean {
  if (!meta.dependsOn || meta.dependsOn.length === 0) return true
  return meta.dependsOn.every((dep) => dep(spec))
}

export function computeCompleteness(spec: CanonicalSpec): CompletenessReport {
  const bySection: Record<SectionKey, SectionCompleteness> = {
    intent: emptySection('intent'),
    domain_model: emptySection('domain_model'),
    capabilities: emptySection('capabilities'),
    flows: emptySection('flows'),
    constraints: emptySection('constraints'),
    references: emptySection('references'),
  }

  const missing: MissingField[] = []
  let weightedPresent = 0
  let weightedTotal = 0

  for (const meta of FIELD_META) {
    const weight = IMPORTANCE_WEIGHT[meta.importance]
    const resolved = isFieldPresent(spec, meta) || isMarkedUnanswerable(spec, meta.path)
    const section = bySection[meta.section]

    section.total += 1
    weightedTotal += weight

    if (resolved) {
      section.present += 1
      weightedPresent += weight
    } else {
      missing.push({
        path: meta.path,
        section: meta.section,
        importance: meta.importance,
        description: meta.description,
        blocked: !areDependenciesSatisfied(spec, meta),
      })
    }
  }

  for (const key of Object.keys(bySection) as SectionKey[]) {
    const s = bySection[key]
    s.score = s.total === 0 ? 1 : s.present / s.total
  }

  missing.sort(compareMissing)
  const nextField = missing.find((m) => !m.blocked) ?? null

  return {
    overall: weightedTotal === 0 ? 1 : weightedPresent / weightedTotal,
    bySection,
    missingPrioritized: missing,
    nextField,
  }
}

function emptySection(section: SectionKey): SectionCompleteness {
  return { section, score: 0, present: 0, total: 0 }
}

function compareMissing(a: MissingField, b: MissingField): number {
  if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
  const impDiff = IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]
  if (impDiff !== 0) return impDiff
  return SECTION_PRIORITY[b.section] - SECTION_PRIORITY[a.section]
}
