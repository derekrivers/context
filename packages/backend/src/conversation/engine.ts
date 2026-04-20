import { asc, eq } from 'drizzle-orm'
import { computeCompleteness, type CanonicalSpec } from '@context/spec-schema'
import type { Db } from '../db/pool.js'
import { conversationTurns, specs, type ConversationTurn } from '../db/schema.js'
import { selectNextField } from './selector.js'
import type { Selection, SelectorTurn } from './types.js'

export class SpecNotFoundError extends Error {
  constructor(specId: string) {
    super(`spec not found: ${specId}`)
    this.name = 'SpecNotFoundError'
  }
}

export interface NextTurnOptions {
  now?: () => Date
  maxTurnsPerSpec?: number
  maxTokensPerSpec?: number
}

export type NextTurnOutcome =
  | { kind: 'selection'; turnId: string; turnIndex: number; selection: Selection }
  | { kind: 'turn_cap_reached'; turnCount: number; limit: number }
  | { kind: 'token_cap_reached'; tokenCount: number; limit: number }
  | { kind: 'complete' }

function toSelectorTurn(row: ConversationTurn): SelectorTurn {
  return {
    turnId: row.id,
    turnIndex: row.turnIndex,
    phase: row.phase,
    targetPath: row.targetPath,
    outcome:
      row.outcome === 'answered' ||
      row.outcome === 'clarification_requested' ||
      row.outcome === 'skipped' ||
      row.outcome === 'unparseable'
        ? row.outcome
        : null,
  }
}

async function loadSpec(db: Db, specId: string): Promise<CanonicalSpec> {
  const rows = await db.client.select().from(specs).where(eq(specs.id, specId)).limit(1)
  const row = rows[0]
  if (!row) throw new SpecNotFoundError(specId)
  return row.specJson as CanonicalSpec
}

export async function loadTurns(db: Db, specId: string): Promise<ConversationTurn[]> {
  return db.client
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.specId, specId))
    .orderBy(asc(conversationTurns.turnIndex))
}

function sumTokens(rows: ConversationTurn[]): number {
  let total = 0
  for (const r of rows) {
    total += r.llmTokensIn ?? 0
    total += r.llmTokensOut ?? 0
  }
  return total
}

export async function nextTurn(
  db: Db,
  specId: string,
  options: NextTurnOptions = {},
): Promise<NextTurnOutcome> {
  const nowFn = options.now ?? (() => new Date())
  const spec = await loadSpec(db, specId)
  const turnRows = await loadTurns(db, specId)

  if (options.maxTurnsPerSpec !== undefined && turnRows.length >= options.maxTurnsPerSpec) {
    return {
      kind: 'turn_cap_reached',
      turnCount: turnRows.length,
      limit: options.maxTurnsPerSpec,
    }
  }
  if (options.maxTokensPerSpec !== undefined) {
    const total = sumTokens(turnRows)
    if (total >= options.maxTokensPerSpec) {
      return {
        kind: 'token_cap_reached',
        tokenCount: total,
        limit: options.maxTokensPerSpec,
      }
    }
  }

  const turns = turnRows.map(toSelectorTurn)

  const selection = selectNextField(spec, turns)
  if (selection === null) return { kind: 'complete' }

  const report = computeCompleteness(spec)
  const bySection: Record<string, number> = {}
  for (const [k, v] of Object.entries(report.bySection)) {
    bySection[k] = v.score
  }
  const completenessSnapshot = { overall: report.overall, by_section: bySection }

  const nextIndex =
    turnRows.length === 0 ? 0 : turnRows[turnRows.length - 1]!.turnIndex + 1

  const inserted = await db.client
    .insert(conversationTurns)
    .values({
      specId,
      turnIndex: nextIndex,
      phase: 'selection',
      targetPath: selection.targetField.path,
      targetSection: selection.targetField.section,
      selectionReason: selection.reason,
      specSnapshot: spec,
      completenessSnapshot,
      createdAt: nowFn(),
    })
    .returning()

  const row = inserted[0]
  if (!row) throw new Error('conversation_turns insert returned no row')

  return {
    kind: 'selection',
    turnId: row.id,
    turnIndex: row.turnIndex,
    selection,
  }
}

export interface RecordPhraseInput {
  db: Db
  selectionTurnId: string
  modelId: string
  tokensIn: number
  tokensOut: number
  questionText?: string
}

export async function recordPhraseTokens(input: RecordPhraseInput): Promise<void> {
  const patch: Partial<ConversationTurn> = {
    llmModelId: input.modelId,
    llmTokensIn: input.tokensIn,
    llmTokensOut: input.tokensOut,
  }
  if (input.questionText !== undefined) patch.questionText = input.questionText
  await input.db.client
    .update(conversationTurns)
    .set(patch)
    .where(eq(conversationTurns.id, input.selectionTurnId))
}

export type AnswerOutcome = 'answered' | 'clarification_requested' | 'skipped'

export interface RecordAnswerInput {
  db: Db
  specId: string
  selectionTurnId: string
  phase: 'answer' | 'clarification' | 'skip'
  outcome: AnswerOutcome
  modelId: string
  tokensIn: number
  tokensOut: number
  userText?: string
  now?: () => Date
}

export async function recordAnswerTurn(
  input: RecordAnswerInput,
): Promise<ConversationTurn | null> {
  const { db, specId, selectionTurnId, phase, outcome, modelId, tokensIn, tokensOut } =
    input
  const nowFn = input.now ?? (() => new Date())

  const selRows = await db.client
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.id, selectionTurnId))
    .limit(1)
  const selection = selRows[0]
  if (!selection || selection.specId !== specId) return null
  if (selection.phase !== 'selection') return null

  const turnRows = await loadTurns(db, specId)
  const nextIndex =
    turnRows.length === 0 ? 0 : turnRows[turnRows.length - 1]!.turnIndex + 1

  const inserted = await db.client
    .insert(conversationTurns)
    .values({
      specId,
      turnIndex: nextIndex,
      phase,
      targetPath: selection.targetPath,
      targetSection: selection.targetSection,
      outcome,
      llmModelId: modelId,
      llmTokensIn: tokensIn,
      llmTokensOut: tokensOut,
      createdAt: nowFn(),
      ...(input.userText !== undefined ? { userText: input.userText } : {}),
    })
    .returning()

  await db.client
    .update(conversationTurns)
    .set({ outcome })
    .where(eq(conversationTurns.id, selectionTurnId))

  return inserted[0] ?? null
}

export interface RecordSkipInput {
  db: Db
  specId: string
  selectionTurnId: string
  now?: () => Date
}

export async function recordSkip(input: RecordSkipInput): Promise<ConversationTurn | null> {
  const { db, specId, selectionTurnId } = input
  const nowFn = input.now ?? (() => new Date())

  const referenced = await db.client
    .select()
    .from(conversationTurns)
    .where(eq(conversationTurns.id, selectionTurnId))
    .limit(1)
  const ref = referenced[0]
  if (!ref || ref.specId !== specId) return null
  if (ref.phase !== 'selection' || !ref.targetPath) return null

  const turnRows = await loadTurns(db, specId)
  const nextIndex =
    turnRows.length === 0 ? 0 : turnRows[turnRows.length - 1]!.turnIndex + 1

  const inserted = await db.client
    .insert(conversationTurns)
    .values({
      specId,
      turnIndex: nextIndex,
      phase: 'skip',
      targetPath: ref.targetPath,
      targetSection: ref.targetSection,
      outcome: 'skipped',
      createdAt: nowFn(),
    })
    .returning()

  return inserted[0] ?? null
}

export interface RecordUnskipInput {
  db: Db
  specId: string
  path: string
  now?: () => Date
}

export async function recordUnskip(
  input: RecordUnskipInput,
): Promise<ConversationTurn | null> {
  const { db, specId, path } = input
  const nowFn = input.now ?? (() => new Date())

  const turnRows = await loadTurns(db, specId)
  const hasPriorSkip = turnRows.some((t) => t.targetPath === path && t.phase === 'skip')
  if (!hasPriorSkip) return null

  const nextIndex =
    turnRows.length === 0 ? 0 : turnRows[turnRows.length - 1]!.turnIndex + 1

  const inserted = await db.client
    .insert(conversationTurns)
    .values({
      specId,
      turnIndex: nextIndex,
      phase: 'unskip',
      targetPath: path,
      createdAt: nowFn(),
    })
    .returning()

  return inserted[0] ?? null
}
