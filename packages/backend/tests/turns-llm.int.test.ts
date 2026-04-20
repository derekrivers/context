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
import { ScriptedLlmClient, textResponse, toolResponse } from './helpers/llm.js'

const config = integrationConfig()
const dbReachable = await probePostgres(config)

async function createUser(
  app: FastifyInstance,
  role: 'editor' | 'viewer',
  name: string,
): Promise<{ id: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${config.adminToken}` },
    payload: { name, role },
  })
  return res.json() as { id: string; token: string }
}

async function createSpec(
  app: FastifyInstance,
  token: string,
): Promise<{ id: string; spec: CanonicalSpec }> {
  const res = await app.inject({
    method: 'POST',
    url: '/specs',
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'LLM Spec' },
  })
  return res.json() as { id: string; spec: CanonicalSpec }
}

async function next(
  app: FastifyInstance,
  token: string,
  specId: string,
): Promise<{ turn_id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/specs/${specId}/turns/next`,
    headers: { authorization: `Bearer ${token}` },
  })
  return res.json() as { turn_id: string }
}

describe.skipIf(!dbReachable)('POST /specs/:id/turns/:turnId/phrase', () => {
  let app: FastifyInstance
  let db: Db
  let client: ScriptedLlmClient

  beforeAll(async () => {
    db = createTestDb(config)
    client = new ScriptedLlmClient()
    app = await buildServer({ config, db, llmClient: client })
  })
  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })
  beforeEach(async () => {
    await resetTables(db)
    client.calls.length = 0
  })

  it('returns phrase text and back-fills token usage on the selection turn', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)

    client.push(textResponse('What problem does this solve?', 123, 11))

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/${selectionTurn.turn_id}/phrase`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      text: string
      tokens_in: number
      tokens_out: number
      model_id: string
    }
    expect(body.text).toBe('What problem does this solve?')
    expect(body.tokens_in).toBe(123)
    expect(body.tokens_out).toBe(11)

    const rows = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.id, selectionTurn.turn_id))
    expect(rows[0]?.llmModelId).toBe('claude-test')
    expect(rows[0]?.llmTokensIn).toBe(123)
    expect(rows[0]?.llmTokensOut).toBe(11)
  })
})

describe.skipIf(!dbReachable)('POST /specs/:id/turns/answer', () => {
  let app: FastifyInstance
  let db: Db
  let client: ScriptedLlmClient

  beforeAll(async () => {
    db = createTestDb(config)
    client = new ScriptedLlmClient()
    app = await buildServer({ config, db, llmClient: client })
  })
  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })
  beforeEach(async () => {
    await resetTables(db)
    client.calls.length = 0
  })

  it('applies update kinds to the spec and records an answer turn', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)

    client.push(
      toolResponse({
        kind: 'update',
        updates: [
          { path: 'intent.summary', value: 'A task tracker', confidence: 'high' },
        ],
      }),
    )

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/answer`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { turn_id: selectionTurn.turn_id, user_text: 'A task tracker.' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { kind: string }
    expect(body.kind).toBe('update')

    const specRow = await db.client.select().from(specs).where(eq(specs.id, id)).limit(1)
    const stored = specRow[0]!.specJson as CanonicalSpec
    expect(stored.intent.summary).toBe('A task tracker')

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))
    expect(turns).toHaveLength(2)
    const selection = turns[0]!
    const answer = turns[1]!
    expect(selection.outcome).toBe('answered')
    expect(answer.phase).toBe('answer')
    expect(answer.outcome).toBe('answered')
    expect(answer.llmTokensIn).toBeGreaterThan(0)
  })

  it('records a clarification turn without modifying the spec', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)

    client.push(
      toolResponse({
        kind: 'clarification',
        question: 'Admins or customers?',
        reason: 'ambiguous',
      }),
    )

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/answer`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { turn_id: selectionTurn.turn_id, user_text: 'users' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { kind: string }).kind).toBe('clarification')

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))
    expect(turns[1]?.phase).toBe('clarification')
    expect(turns[1]?.outcome).toBe('clarification_requested')
    expect(turns[0]?.outcome).toBe('clarification_requested')
  })

  it('records a skip turn when the model reports skip intent', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)

    client.push(toolResponse({ kind: 'skip' }))

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/answer`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { turn_id: selectionTurn.turn_id, user_text: 'skip for now' },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { kind: string }).kind).toBe('skip')

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))
    expect(turns[1]?.phase).toBe('skip')
    expect(turns[1]?.outcome).toBe('skipped')
  })

  it('writes an unresolved question on unknown intent', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)

    client.push(toolResponse({ kind: 'unknown', reason: 'pending stakeholder input' }))

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/answer`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { turn_id: selectionTurn.turn_id, user_text: "I don't know yet" },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { kind: string }).kind).toBe('unknown')

    const specRow = await db.client.select().from(specs).where(eq(specs.id, id)).limit(1)
    const stored = specRow[0]!.specJson as CanonicalSpec
    const q = stored.provenance.unresolved_questions.find((u) => u.path === 'intent.summary')
    expect(q?.state).toBe('unanswerable')
    expect(q?.reason).toBe('pending stakeholder input')
  })

  it('rejects viewer-share callers with 403', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    const selectionTurn = await next(app, alice.token, id)
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { user_id: bob.id, role: 'viewer' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/answer`,
      headers: { authorization: `Bearer ${bob.token}` },
      payload: { turn_id: selectionTurn.turn_id, user_text: 'hi' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe.skipIf(!dbReachable)('nextTurn caps via HTTP', () => {
  let app: FastifyInstance
  let db: Db
  let client: ScriptedLlmClient

  beforeAll(async () => {
    db = createTestDb(config)
    client = new ScriptedLlmClient()
    app = await buildServer({
      config: { ...config, maxTurnsPerSpec: 2, maxTokensPerSpec: 500000 },
      db,
      llmClient: client,
    })
  })
  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })
  beforeEach(async () => {
    await resetTables(db)
    client.calls.length = 0
  })

  it('returns turn_cap_reached once the hard limit is hit', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    await next(app, alice.token, id) // turn 0
    await next(app, alice.token, id) // turn 1

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { kind: string; turn_count: number; limit: number }
    expect(body.kind).toBe('turn_cap_reached')
    expect(body.limit).toBe(2)
    expect(body.turn_count).toBeGreaterThanOrEqual(2)
  })
})
