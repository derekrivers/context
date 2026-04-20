import type { CanonicalSpec, Importance, SectionKey } from '@context/spec-schema'

export type TurnPhase =
  | 'selection'
  | 'answer'
  | 'clarification'
  | 'skip'
  | 'unskip'
  | 'direct_edit'
  | 'retry_request'

export type TurnOutcome = 'answered' | 'clarification_requested' | 'skipped' | 'unparseable'

export interface FieldRef {
  path: string
  section: SectionKey
  schemaRef: string
  importance: Importance
}

export type SelectionReason =
  | { kind: 'highest_priority_unblocked' }
  | { kind: 'retry_after_clarification'; previousTurnId: string }
  | { kind: 'user_unskipped'; previousSkipTurnId: string }

export interface TurnSummary {
  turnId: string
  targetPath: string
  outcome: TurnOutcome
}

export interface SelectionContext {
  surroundingSpec: unknown
  relatedFields: FieldRef[]
  recentTurns: TurnSummary[]
}

export interface Selection {
  targetField: FieldRef
  context: SelectionContext
  reason: SelectionReason
}

export interface SelectorTurn {
  turnId: string
  turnIndex: number
  phase: TurnPhase
  targetPath: string | null
  outcome: TurnOutcome | null
}

export interface FieldDescriptor {
  path: string
  section: SectionKey
  importance: Importance
  schemaRef: string
  kind: 'scalar' | 'collection'
  minElements?: number
  description: string
  declarationOrder: number
}

export type SpecRef = CanonicalSpec
