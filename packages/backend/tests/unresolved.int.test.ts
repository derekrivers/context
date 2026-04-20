import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { CanonicalSpec } from '@context/spec-schema'
import { buildServer } from '../src/server.js'
import { conversationTurns, specs } from '../src/db/schema.js'
import type { Db } from '../src/db/pool.js'
import {
  createTestDb,
  integrationConfig,
  probePostgres,
  resetTables,
} from './helpers/db.js'

const config = integrationConfig()
const dbReachable = await probePostgres(config)

async function createUser(
  app: FastifyInstance,
  name: string,
): Promise<{ id: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${config.adminToken}` },
    payload: { name, role: 'editor' },
  })
  return res.json() as { id: string; token: string }
}

async function createSpec(app: FastifyInstance, token: string): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/specs',
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'Unresolved' },
  })
  return res.json() as { id: string }
}

async function insertTurn(
  db: Db,
  specId: string,
  turnIndex: number,
  phase: string,
  targetPath: string | null,
  outcome: string | null,
  targetSection: string | null = null,
): Promise<void> {
  await db.client.insert(conversationTurns).values({
    specId,
    turnIndex,
    phase: phase as 'selection' | 'answer' | 'clarification' | 'skip' | 'unskip' | 'direct_edit' | 'retry_request',
    targetPath,
    targetSection,
    outcome,
  })
}

describe.skipIf(!dbReachable)('GET /specs/:id/unresolved', () => {
  let app: FastifyInstance
  let db: Db

  beforeAll(async () => {
    db = createTestDb(config)
    app = await buildServer({ config, db })
  })
  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })
  beforeEach(async () => {
    await resetTables(db)
  })

  it('returns retry_budget_exhausted paths', async () => {
    const alice = await createUser(app, 'Alice')
    const { id } = await createSpec(app, alice.token)
    await insertTurn(db, id, 0, 'selection', 'intent.summary', null, 'intent')
    await insertTurn(db, id, 1, 'clarification', 'intent.summary', 'clarification_requested', 'intent')
    await insertTurn(db, id, 2, 'clarification', 'intent.summary', 'clarification_requested', 'intent')
    await insertTurn(db, id, 3, 'answer', 'intent.summary', 'unparseable', 'intent')

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/unresolved`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      entries: Array<{ path: string; reason: string; retries_attempted: number }>
    }
    const hit = body.entries.find((e) => e.path === 'intent.summary')
    expect(hit).toBeDefined()
    expect(hit?.reason).toBe('retry_budget_exhausted')
    expect(hit?.retries_attempted).toBeGreaterThanOrEqual(3)
  })

  it('returns user_marked_unanswerable entries from provenance', async () => {
    const alice = await createUser(app, 'Alice')
    const { id } = await createSpec(app, alice.token)
    const existing = await db.client.select().from(specs).where(eq(specs.id, id)).limit(1)
    const spec = existing[0]!.specJson as CanonicalSpec
    const patched: CanonicalSpec = {
      ...spec,
      provenance: {
        ...spec.provenance,
        unresolved_questions: [
          {
            id: 'q_test',
            path: 'constraints.auth',
            reason: 'user marked as unanswerable',
            state: 'unanswerable',
            created_at: new Date().toISOString(),
          },
        ],
      },
    }
    await db.client.update(specs).set({ specJson: patched }).where(eq(specs.id, id))

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/unresolved`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const body = res.json() as { entries: Array<{ path: string; reason: string }> }
    expect(body.entries[0]?.path).toBe('constraints.auth')
    expect(body.entries[0]?.reason).toBe('user_marked_unanswerable')
  })
})

describe.skipIf(!dbReachable)('POST /specs/:id/fields/retry', () => {
  let app: FastifyInstance
  let db: Db

  beforeAll(async () => {
    db = createTestDb(config)
    app = await buildServer({ config, db })
  })
  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })
  beforeEach(async () => {
    await resetTables(db)
  })

  it('writes a retry_request turn and the selector no longer treats the path as exhausted', async () => {
    const alice = await createUser(app, 'Alice')
    const { id } = await createSpec(app, alice.token)
    await insertTurn(db, id, 0, 'selection', 'intent.summary', null, 'intent')
    await insertTurn(db, id, 1, 'answer', 'intent.summary', 'unparseable', 'intent')
    await insertTurn(db, id, 2, 'answer', 'intent.summary', 'unparseable', 'intent')
    await insertTurn(db, id, 3, 'answer', 'intent.summary', 'unparseable', 'intent')

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/fields/retry`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { path: 'intent.summary' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { path: string; retry_cleared: boolean }
    expect(body.retry_cleared).toBe(true)

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))
    const retry = turns.find((t) => t.phase === 'retry_request')
    expect(retry?.targetPath).toBe('intent.summary')

    const afterUnresolved = await app.inject({
      method: 'GET',
      url: `/specs/${id}/unresolved`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const entries = (afterUnresolved.json() as { entries: unknown[] }).entries
    expect(entries).toHaveLength(0)
  })

  it('returns 400 when the path is not currently unresolved', async () => {
    const alice = await createUser(app, 'Alice')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/fields/retry`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { path: 'intent.summary' },
    })
    expect(res.statusCode).toBe(400)
  })
})
