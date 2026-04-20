import { eq } from 'drizzle-orm'
import { CanonicalSpecSchema, type CanonicalSpec } from '@context/spec-schema'
import type { Db } from '../db/pool.js'
import { specHistory, specs, type Spec } from '../db/schema.js'
import { computeDiff } from '../lib/diff.js'
import type { FieldUpdate } from './parse.js'

export class SpecApplyError extends Error {
  readonly failures: Array<{ path: string; message: string }>
  constructor(failures: Array<{ path: string; message: string }>, message: string) {
    super(message)
    this.name = 'SpecApplyError'
    this.failures = failures
  }
}

function tokenisePath(path: string): Array<string | number> {
  const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? []
  return tokens.map((t) => {
    const idx = /^\[(\d+)\]$/.exec(t)
    return idx && idx[1] !== undefined ? Number.parseInt(idx[1], 10) : t
  })
}

function setValueAtPath(root: unknown, path: string, value: unknown): unknown {
  const tokens = tokenisePath(path)
  if (tokens.length === 0) return root

  const clonedRoot: unknown = structuredClone(root)
  let cursor: unknown = clonedRoot

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!
    const nextToken = tokens[i + 1]!
    const wantArray = typeof nextToken === 'number'

    if (typeof token === 'number') {
      if (!Array.isArray(cursor)) throw new Error(`path ${path}: expected array at ${token}`)
      if (cursor[token] === undefined) cursor[token] = wantArray ? [] : {}
      cursor = cursor[token]
    } else {
      if (cursor === null || typeof cursor !== 'object') {
        throw new Error(`path ${path}: cannot descend into non-object at ${token}`)
      }
      const obj = cursor as Record<string, unknown>
      if (obj[token] === undefined) obj[token] = wantArray ? [] : {}
      cursor = obj[token]
    }
  }

  const last = tokens[tokens.length - 1]!
  if (typeof last === 'number') {
    if (!Array.isArray(cursor)) throw new Error(`path ${path}: expected array at leaf`)
    cursor[last] = value
  } else {
    if (cursor === null || typeof cursor !== 'object') {
      throw new Error(`path ${path}: cannot set on non-object leaf`)
    }
    ;(cursor as Record<string, unknown>)[last] = value
  }

  return clonedRoot
}

export interface ApplyUpdatesInput {
  db: Db
  specId: string
  authorId: string
  updates: FieldUpdate[]
  now?: () => Date
}

export interface ApplyUpdatesResult {
  spec: CanonicalSpec
  row: Spec
}

export async function applyFieldUpdates(
  input: ApplyUpdatesInput,
): Promise<ApplyUpdatesResult> {
  const { db, specId, authorId, updates } = input
  const nowFn = input.now ?? (() => new Date())

  const rows = await db.client.select().from(specs).where(eq(specs.id, specId)).limit(1)
  const row = rows[0]
  if (!row) throw new SpecApplyError([], `spec not found: ${specId}`)

  let nextSpec: unknown = row.specJson
  const setFailures: Array<{ path: string; message: string }> = []
  for (const u of updates) {
    try {
      nextSpec = setValueAtPath(nextSpec, u.path, u.value)
    } catch (err) {
      setFailures.push({
        path: u.path,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  if (setFailures.length > 0) {
    throw new SpecApplyError(setFailures, 'one or more updates could not be set at their paths')
  }

  const now = nowFn()
  const normalised = nextSpec as CanonicalSpec
  const withTimestamps: CanonicalSpec = {
    ...normalised,
    id: row.id,
    schema_version: row.schemaVersion as CanonicalSpec['schema_version'],
    created_at: row.createdAt.toISOString(),
    updated_at: now.toISOString(),
  }

  const validated = CanonicalSpecSchema.safeParse(withTimestamps)
  if (!validated.success) {
    const failures = validated.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }))
    throw new SpecApplyError(failures, 'applied spec failed schema validation')
  }

  const nextSpecValidated = validated.data
  const diff = computeDiff(row.specJson, nextSpecValidated)

  const updated = await db.client
    .update(specs)
    .set({
      title: nextSpecValidated.title,
      status: nextSpecValidated.status,
      specJson: nextSpecValidated,
      updatedAt: now,
    })
    .where(eq(specs.id, specId))
    .returning()

  const nextRow = updated[0]
  if (!nextRow) throw new Error('spec update returned no row')

  await db.client.insert(specHistory).values({
    specId,
    authorId,
    diff,
    specJsonAfter: nextSpecValidated,
    createdAt: now,
  })

  return { spec: nextSpecValidated, row: nextRow }
}
