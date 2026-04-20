import {
  computeCompleteness,
  type CanonicalSpec,
  type Importance,
  type SectionKey,
} from '@context/spec-schema'
import { isDependencySatisfied } from './dependencies.js'
import type {
  FieldDescriptor,
  FieldRef,
  Selection,
  SelectionReason,
  SelectorTurn,
  TurnSummary,
} from './types.js'

export const SECTION_THRESHOLDS: Record<SectionKey, number> = {
  intent: 0.95,
  domain_model: 0.8,
  capabilities: 0.8,
  flows: 0.6,
  constraints: 0.6,
  references: 0.2,
}

export const SKIP_WINDOW = 5
export const RETRY_BUDGET = 3
export const RECENT_TURNS_LIMIT = 3

const SECTION_PRIORITY: Record<SectionKey, number> = {
  intent: 6,
  domain_model: 5,
  capabilities: 4,
  flows: 3,
  constraints: 2,
  references: 1,
}

const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const BASE_FIELDS: Omit<FieldDescriptor, 'declarationOrder'>[] = [
  {
    path: 'intent.summary',
    section: 'intent',
    importance: 'critical',
    schemaRef: 'intent.summary',
    kind: 'scalar',
    description: 'One-line description of what is being built.',
  },
  {
    path: 'intent.problem',
    section: 'intent',
    importance: 'critical',
    schemaRef: 'intent.problem',
    kind: 'scalar',
    description: 'The problem this system exists to solve.',
  },
  {
    path: 'intent.users',
    section: 'intent',
    importance: 'high',
    schemaRef: 'intent.users',
    kind: 'collection',
    minElements: 1,
    description: 'User personas with needs.',
  },
  {
    path: 'intent.non_goals',
    section: 'intent',
    importance: 'medium',
    schemaRef: 'intent.non_goals',
    kind: 'collection',
    minElements: 1,
    description: 'Things this system explicitly will not do.',
  },
  {
    path: 'domain_model.entities',
    section: 'domain_model',
    importance: 'critical',
    schemaRef: 'domain_model.entities',
    kind: 'collection',
    minElements: 1,
    description: 'Entities in the domain model.',
  },
  {
    path: 'domain_model.relationships',
    section: 'domain_model',
    importance: 'medium',
    schemaRef: 'domain_model.relationships',
    kind: 'collection',
    minElements: 1,
    description: 'Relationships between entities.',
  },
  {
    path: 'capabilities',
    section: 'capabilities',
    importance: 'high',
    schemaRef: 'capabilities',
    kind: 'collection',
    minElements: 1,
    description: 'Verbs against entities.',
  },
  {
    path: 'flows',
    section: 'flows',
    importance: 'medium',
    schemaRef: 'flows',
    kind: 'collection',
    minElements: 1,
    description: 'End-to-end user flows.',
  },
  {
    path: 'constraints.platform',
    section: 'constraints',
    importance: 'medium',
    schemaRef: 'constraints.platform',
    kind: 'scalar',
    description: 'Target platform.',
  },
  {
    path: 'constraints.stack',
    section: 'constraints',
    importance: 'medium',
    schemaRef: 'constraints.stack',
    kind: 'scalar',
    description: 'Preferred stack.',
  },
  {
    path: 'constraints.auth',
    section: 'constraints',
    importance: 'medium',
    schemaRef: 'constraints.auth',
    kind: 'scalar',
    description: 'Authentication posture.',
  },
  {
    path: 'constraints.data_retention',
    section: 'constraints',
    importance: 'low',
    schemaRef: 'constraints.data_retention',
    kind: 'scalar',
    description: 'Data retention policy.',
  },
  {
    path: 'constraints.performance',
    section: 'constraints',
    importance: 'low',
    schemaRef: 'constraints.performance',
    kind: 'scalar',
    description: 'Performance expectations.',
  },
  {
    path: 'constraints.compliance',
    section: 'constraints',
    importance: 'low',
    schemaRef: 'constraints.compliance',
    kind: 'scalar',
    description: 'Compliance requirements.',
  },
  {
    path: 'constraints.deploy_posture',
    section: 'constraints',
    importance: 'low',
    schemaRef: 'constraints.deploy_posture',
    kind: 'scalar',
    description: 'Deployment posture.',
  },
  {
    path: 'references',
    section: 'references',
    importance: 'low',
    schemaRef: 'references',
    kind: 'collection',
    minElements: 1,
    description: 'Pointers to existing implementations.',
  },
]

const BASE_FIELDS_WITH_ORDER: FieldDescriptor[] = BASE_FIELDS.map((f, i) => ({
  ...f,
  declarationOrder: i,
}))

function expandSubFields(spec: CanonicalSpec): FieldDescriptor[] {
  const subs: FieldDescriptor[] = []
  let order = BASE_FIELDS_WITH_ORDER.length

  spec.capabilities.forEach((cap, i) => {
    subs.push({
      path: `capabilities[${i}].acceptance_criteria`,
      section: 'capabilities',
      importance: 'medium',
      schemaRef: 'capabilities[*].acceptance_criteria',
      kind: 'collection',
      minElements: 1,
      description: `Acceptance criteria for capability "${cap.name || cap.id}".`,
      declarationOrder: order++,
    })
  })

  spec.flows.forEach((flow, i) => {
    if (!flow.trigger) {
      subs.push({
        path: `flows[${i}].trigger`,
        section: 'flows',
        importance: 'medium',
        schemaRef: 'flows[*].trigger',
        kind: 'scalar',
        description: `Trigger for flow "${flow.name || flow.id}".`,
        declarationOrder: order++,
      })
    }
    subs.push({
      path: `flows[${i}].steps`,
      section: 'flows',
      importance: 'medium',
      schemaRef: 'flows[*].steps',
      kind: 'collection',
      minElements: 1,
      description: `Steps for flow "${flow.name || flow.id}".`,
      declarationOrder: order++,
    })
    subs.push({
      path: `flows[${i}].failure_modes`,
      section: 'flows',
      importance: 'low',
      schemaRef: 'flows[*].failure_modes',
      kind: 'collection',
      minElements: 1,
      description: `Failure modes for flow "${flow.name || flow.id}".`,
      declarationOrder: order++,
    })
  })

  return subs
}

export function getSelectableFields(spec: CanonicalSpec): FieldDescriptor[] {
  return [...BASE_FIELDS_WITH_ORDER, ...expandSubFields(spec)]
}

function getValueAtPath(spec: CanonicalSpec, path: string): unknown {
  const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? []
  let current: unknown = spec
  for (const rawToken of tokens) {
    if (current == null) return undefined
    const idxMatch = /^\[(\d+)\]$/.exec(rawToken)
    if (idxMatch && idxMatch[1] !== undefined) {
      const i = Number.parseInt(idxMatch[1], 10)
      if (!Array.isArray(current)) return undefined
      current = current[i]
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[rawToken]
  }
  return current
}

function isValuePresent(value: unknown, field: FieldDescriptor): boolean {
  if (field.kind === 'collection') {
    const min = field.minElements ?? 1
    return Array.isArray(value) && value.length >= min
  }
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

function isMarkedUnanswerable(spec: CanonicalSpec, path: string): boolean {
  return spec.provenance.unresolved_questions.some(
    (q) => q.path === path && q.state === 'unanswerable',
  )
}

function hasAcknowledgementTurn(path: string, turns: SelectorTurn[]): boolean {
  return turns.some((t) => t.targetPath === path && t.outcome === 'answered')
}

function isMissing(
  spec: CanonicalSpec,
  field: FieldDescriptor,
  turns: SelectorTurn[],
): boolean {
  const value = getValueAtPath(spec, field.path)
  if (!isValuePresent(value, field)) {
    return !(isMarkedUnanswerable(spec, field.path) && hasAcknowledgementTurn(field.path, turns))
  }
  if (isMarkedUnanswerable(spec, field.path)) {
    return !hasAcknowledgementTurn(field.path, turns)
  }
  return false
}

function isSkippedRecently(path: string, turns: SelectorTurn[]): boolean {
  if (turns.length === 0) return false
  const latestOnPath = [...turns].reverse().find((t) => t.targetPath === path)
  if (!latestOnPath || latestOnPath.outcome !== 'skipped') return false
  const latestTurnIndex = turns[turns.length - 1]!.turnIndex
  return latestTurnIndex - latestOnPath.turnIndex < SKIP_WINDOW
}

function isRetryExhausted(path: string, turns: SelectorTurn[]): boolean {
  // A retry_request turn for this path resets the count. Only count bad
  // outcomes that occurred *after* the most recent retry_request.
  let lastRetryIndex = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (t.phase === 'retry_request' && t.targetPath === path) {
      lastRetryIndex = t.turnIndex
      break
    }
  }
  const bad = turns.filter(
    (t) =>
      t.targetPath === path &&
      t.turnIndex > lastRetryIndex &&
      (t.outcome === 'unparseable' || t.outcome === 'clarification_requested'),
  )
  return bad.length >= RETRY_BUDGET
}

function compareFields(a: FieldDescriptor, b: FieldDescriptor): number {
  const secDiff = SECTION_PRIORITY[b.section] - SECTION_PRIORITY[a.section]
  if (secDiff !== 0) return secDiff
  const impDiff = IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]
  if (impDiff !== 0) return impDiff
  return a.declarationOrder - b.declarationOrder
}

export function isCompleteEnough(spec: CanonicalSpec): boolean {
  const report = computeCompleteness(spec)
  for (const section of Object.keys(SECTION_THRESHOLDS) as SectionKey[]) {
    const score = report.bySection[section].score
    if (score < SECTION_THRESHOLDS[section]) return false
  }
  return true
}

function latestClarificationTurn(turns: SelectorTurn[]): SelectorTurn | null {
  if (turns.length === 0) return null
  const last = turns[turns.length - 1]!
  return last.outcome === 'clarification_requested' && last.targetPath ? last : null
}

function findPendingUnskip(turns: SelectorTurn[]): {
  targetPath: string
  unskipTurnId: string
  skipTurnId: string
} | null {
  const unskips = turns.filter((t) => t.phase === 'unskip' && t.targetPath)
  for (let i = unskips.length - 1; i >= 0; i--) {
    const u = unskips[i]!
    const priorSkip = [...turns]
      .reverse()
      .find(
        (t) =>
          t.targetPath === u.targetPath && t.phase === 'skip' && t.turnIndex < u.turnIndex,
      )
    if (priorSkip) {
      return {
        targetPath: u.targetPath!,
        unskipTurnId: u.turnId,
        skipTurnId: priorSkip.turnId,
      }
    }
  }
  return null
}

function toFieldRef(f: FieldDescriptor): FieldRef {
  return {
    path: f.path,
    section: f.section,
    schemaRef: f.schemaRef,
    importance: f.importance,
  }
}

function buildContext(
  spec: CanonicalSpec,
  field: FieldDescriptor,
  turns: SelectorTurn[],
  allFields: FieldDescriptor[],
): Selection['context'] {
  const parentPath = field.path.includes('.')
    ? field.path.slice(0, field.path.lastIndexOf('.'))
    : ''
  const surroundingSpec = parentPath ? getValueAtPath(spec, parentPath) : spec

  const relatedFields: FieldRef[] = allFields
    .filter((f) => f.path !== field.path && f.section === field.section)
    .slice(0, 8)
    .map(toFieldRef)

  const recentTurns: TurnSummary[] = turns
    .filter((t) => t.targetPath !== null && t.outcome !== null)
    .slice(-RECENT_TURNS_LIMIT)
    .map((t) => ({
      turnId: t.turnId,
      targetPath: t.targetPath!,
      outcome: t.outcome!,
    }))

  return { surroundingSpec, relatedFields, recentTurns }
}

export function selectNextField(
  spec: CanonicalSpec,
  turns: SelectorTurn[],
): Selection | null {
  const allFields = getSelectableFields(spec)

  const missing = allFields.filter((f) => isMissing(spec, f, turns))
  const unblocked = missing.filter((f) => isDependencySatisfied(spec, f.path))
  const notSkipped = unblocked.filter((f) => !isSkippedRecently(f.path, turns))
  const candidates = notSkipped.filter((f) => !isRetryExhausted(f.path, turns))

  const clarification = latestClarificationTurn(turns)
  if (clarification && clarification.targetPath) {
    const hit = candidates.find((c) => c.path === clarification.targetPath)
    if (hit) {
      return {
        targetField: toFieldRef(hit),
        context: buildContext(spec, hit, turns, allFields),
        reason: { kind: 'retry_after_clarification', previousTurnId: clarification.turnId },
      }
    }
  }

  const unskip = findPendingUnskip(turns)
  if (unskip) {
    const hit = candidates.find((c) => c.path === unskip.targetPath)
    if (hit) {
      return {
        targetField: toFieldRef(hit),
        context: buildContext(spec, hit, turns, allFields),
        reason: { kind: 'user_unskipped', previousSkipTurnId: unskip.skipTurnId },
      }
    }
  }

  const ranked = [...candidates].sort(compareFields)

  if (ranked.length > 0) {
    const top = ranked[0]!
    return {
      targetField: toFieldRef(top),
      context: buildContext(spec, top, turns, allFields),
      reason: { kind: 'highest_priority_unblocked' },
    }
  }

  if (isCompleteEnough(spec)) return null

  const retryDropped = notSkipped
    .filter((f) => isRetryExhausted(f.path, turns))
    .sort(compareFields)
  if (retryDropped.length > 0) {
    const top = retryDropped[0]!
    const lastTurn = [...turns].reverse().find((t) => t.targetPath === top.path)
    return {
      targetField: toFieldRef(top),
      context: buildContext(spec, top, turns, allFields),
      reason: {
        kind: 'retry_after_clarification',
        previousTurnId: lastTurn?.turnId ?? '',
      },
    }
  }

  return null
}
