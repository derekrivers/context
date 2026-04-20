import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { CanonicalSpec } from '@context/spec-schema'
import { buildServer } from '../src/server.js'
import { conversationTurns } from '../src/db/schema.js'
import type { Db } from '../src/db/pool.js'
import { createTestDb, integrationConfig, probePostgres, resetTables } from './helpers/db.js'

const config = integrationConfig()
const dbReachable = await probePostgres(config)

async function createUser(app: FastifyInstance, name: string): Promise<{ id: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${config.adminToken}` },
    payload: { name, role: 'editor' },
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
    payload: { title: 'Direct Edit Spec' },
  })
  return res.json() as { id: string; spec: CanonicalSpec }
}

async function lock(app: FastifyInstance, token: string, id: string): Promise<void> {
  await app.inject({
    method: 'POST',
    url: `/specs/${id}/lock`,
    headers: { authorization: `Bearer ${token}` },
  })
}

describe.skipIf(!dbReachable)('PATCH /specs/:id writes direct_edit turns', () => {
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

  it('writes a direct_edit turn for each changed field', async () => {
    const alice = await createUser(app, 'Alice')
    const { id, spec } = await createSpec(app, alice.token)
    await lock(app, alice.token, id)

    const next: CanonicalSpec = {
      ...spec,
      intent: { ...spec.intent, summary: 'A new task tracker', problem: 'users lose track' },
    }
    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { spec: next },
    })
    expect(res.statusCode).toBe(200)

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
      .orderBy(asc(conversationTurns.turnIndex))

    const directEdits = turns.filter((t) => t.phase === 'direct_edit')
    const paths = directEdits.map((t) => t.targetPath).sort()
    expect(paths).toContain('intent.summary')
    expect(paths).toContain('intent.problem')
    for (const t of directEdits) {
      expect(t.outcome).toBe('answered')
      expect(t.targetSection).toBe('intent')
      expect(t.specSnapshot).toBeDefined()
      expect(t.completenessSnapshot).toBeDefined()
      expect(t.llmModelId).toBeNull()
    }
  })

  it('does not write a direct_edit turn when the PATCH leaves the spec unchanged', async () => {
    const alice = await createUser(app, 'Alice')
    const { id } = await createSpec(app, alice.token)
    await lock(app, alice.token, id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'Direct Edit Spec' },
    })
    expect(res.statusCode).toBe(200)

    const turns = await db.client
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.specId, id))
    const directEdits = turns.filter((t) => t.phase === 'direct_edit')
    expect(directEdits).toHaveLength(0)
  })
})
