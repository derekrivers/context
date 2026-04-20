import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { CanonicalSpec } from '@context/spec-schema'
import { buildServer } from '../src/server.js'
import { nextTurn, SpecNotFoundError } from '../src/conversation/engine.js'
import { conversationTurns, specs } from '../src/db/schema.js'
import type { Db } from '../src/db/pool.js'
import { createTestDb, integrationConfig, probePostgres, resetTables } from './helpers/db.js'

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
  title = 'Engine Spec',
): Promise<{ id: string; spec: CanonicalSpec }> {
  const res = await app.inject({
    method: 'POST',
    url: '/specs',
    headers: { authorization: `Bearer ${token}` },
    payload: { title },
  })
  expect(res.statusCode).toBe(201)
  return res.json() as { id: string; spec: CanonicalSpec }
}

describe.skipIf(!dbReachable)('nextTurn (engine)', () => {
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

  it('throws SpecNotFoundError for an unknown spec id', async () => {
    await expect(nextTurn(db, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      SpecNotFoundError,
    )
  })

  it('writes a selection turn with spec and completeness snapshots', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const result = await nextTurn(db, id)
    expect(result).not.toBeNull()
    expect(result!.turnIndex).toBe(0)
    expect(result!.selection.targetField.path).toBe('intent.summary')

    const rows = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.phase).toBe('selection')
    expect(row.targetPath).toBe('intent.summary')
    expect(row.targetSection).toBe('intent')
    expect(row.specSnapshot).toBeDefined()
    expect(row.completenessSnapshot).toBeDefined()
    expect((row.selectionReason as { kind: string }).kind).toBe('highest_priority_unblocked')
  })

  it('issues monotonically increasing turn_index values per spec', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const a = await nextTurn(db, id)
    const b = await nextTurn(db, id)
    const c = await nextTurn(db, id)

    expect(a!.turnIndex).toBe(0)
    expect(b!.turnIndex).toBe(1)
    expect(c!.turnIndex).toBe(2)

    const rows = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))
    expect(rows.map((r) => r.turnIndex)).toEqual([0, 1, 2])
  })

  it('advances the target after the spec is edited', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id, spec } = await createSpec(app, alice.token)

    const first = await nextTurn(db, id)
    expect(first!.selection.targetField.path).toBe('intent.summary')

    const next: CanonicalSpec = { ...spec, intent: { ...spec.intent, summary: 'Something' } }
    await db.client.update(specs).set({ specJson: next }).where(eq(specs.id, id))

    const second = await nextTurn(db, id)
    expect(second!.selection.targetField.path).not.toBe('intent.summary')
    expect(second!.selection.targetField.section).toBe('intent')
  })

  it('returns null without writing a row when the spec is sufficiently complete', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id, spec } = await createSpec(app, alice.token)

    const complete: CanonicalSpec = {
      ...spec,
      intent: {
        summary: 's',
        problem: 'p',
        users: [{ id: 'u1', persona: 'x' }],
        non_goals: ['nothing'],
      },
      domain_model: {
        entities: [
          { id: 'a', name: 'A', fields: [{ name: 'id', type: 'string' }] },
          { id: 'b', name: 'B', fields: [{ name: 'id', type: 'string' }] },
        ],
        relationships: [
          { id: 'r1', from_entity: 'a', to_entity: 'b', kind: 'one_to_many' },
        ],
      },
      capabilities: [
        {
          id: 'c1',
          name: 'Create A',
          entity_ref: 'a',
          verb: 'create',
          acceptance_criteria: [
            { id: 'ac1', given: 'g', when: 'w', then: 't' },
          ],
        },
      ],
      flows: [
        {
          id: 'f1',
          name: 'F',
          trigger: 'x',
          steps: [
            { actor: 'user', action: 'a' },
            { actor: 'system', action: 'b' },
          ],
          failure_modes: [{ when: 'x', behavior: 'y' }],
        },
      ],
      constraints: {
        platform: 'web',
        stack: { frontend: 'React' },
        auth: 'bearer',
        data_retention: 'x',
        performance: 'x',
        compliance: 'x',
        deploy_posture: 'x',
      },
      references: [{ id: 'r', label: 'r', url_or_path: '/r' }],
    }
    await db.client.update(specs).set({ specJson: complete }).where(eq(specs.id, id))

    const result = await nextTurn(db, id)
    expect(result).toBeNull()

    const rows = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
    expect(rows).toHaveLength(0)
  })
})

describe.skipIf(!dbReachable)('POST /specs/:id/turns/next', () => {
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

  it('returns the selection for the owner', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      turn_id: string
      turn_index: number
      target_field: { path: string; section: string }
      reason: { kind: string }
    }
    expect(body.turn_index).toBe(0)
    expect(body.target_field.path).toBe('intent.summary')
    expect(body.target_field.section).toBe('intent')
    expect(body.reason.kind).toBe('highest_priority_unblocked')
  })

  it('returns 404 for a non-owner stranger', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 for a viewer share', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { user_id: bob.id, role: 'viewer' },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe.skipIf(!dbReachable)('skip + unskip flow', () => {
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

  it('skip → next picks a different path', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const nextRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const first = nextRes.json() as { turn_id: string; target_field: { path: string } }
    expect(first.target_field.path).toBe('intent.summary')

    const skipRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/${first.turn_id}/skip`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(skipRes.statusCode).toBe(201)

    const next2 = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const second = next2.json() as { target_field: { path: string } }
    expect(second.target_field.path).not.toBe('intent.summary')
    expect(second.target_field.path).toBe('intent.problem')
  })

  it('rejects unskip with no prior skip', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/unskip`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { path: 'intent.summary' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('unskip after skip promotes the path on the next selection', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const n1 = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const first = n1.json() as { turn_id: string }
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/${first.turn_id}/skip`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    // advance through a handful of turns so the skip window is not the issue being tested
    for (let i = 0; i < 6; i++) {
      await app.inject({
        method: 'POST',
        url: `/specs/${id}/turns/next`,
        headers: { authorization: `Bearer ${alice.token}` },
      })
    }
    const unskipRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/unskip`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { path: 'intent.summary' },
    })
    expect(unskipRes.statusCode).toBe(201)

    const next = await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const body = next.json() as { target_field: { path: string }; reason: { kind: string } }
    expect(body.target_field.path).toBe('intent.summary')
    expect(body.reason.kind).toBe('user_unskipped')
  })
})

describe.skipIf(!dbReachable)('GET /specs/:id/turns', () => {
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

  it('returns turn history to the owner, oldest first', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/turns`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { turns: Array<{ turn_index: number }> }
    expect(body.turns).toHaveLength(2)
    expect(body.turns[0]!.turn_index).toBe(0)
    expect(body.turns[1]!.turn_index).toBe(1)
  })

  it('allows a viewer share to read the history', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { user_id: bob.id, role: 'viewer' },
    })
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/turns/next`,
      headers: { authorization: `Bearer ${alice.token}` },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/turns`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 404 to users with no access', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const carol = await createUser(app, 'editor', 'Carol')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/turns`,
      headers: { authorization: `Bearer ${carol.token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
