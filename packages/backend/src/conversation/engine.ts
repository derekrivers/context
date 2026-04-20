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
}

export interface NextTurnResult {
  turnId: string
  turnIndex: number
  selection: Selection
}

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

export async function nextTurn(
  db: Db,
  specId: string,
  options: NextTurnOptions = {},
): Promise<NextTurnResult | null> {
  const nowFn = options.now ?? (() => new Date())
  const spec = await loadSpec(db, specId)
  const turnRows = await loadTurns(db, specId)
  const turns = turnRows.map(toSelectorTurn)

  const selection = selectNextField(spec, turns)
  if (selection === null) return null

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
    turnId: row.id,
    turnIndex: row.turnIndex,
    selection,
  }
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
