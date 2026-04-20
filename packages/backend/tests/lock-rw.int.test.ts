import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.js'
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

async function createSpec(app: FastifyInstance, token: string): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/specs',
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'Lock Spec' },
  })
  return res.json() as { id: string }
}

describe.skipIf(!dbReachable)('GET /specs/:id/lock', () => {
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

  it('returns null locked_by when no lock is held', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { locked_by: string | null; held_by_caller: boolean }
    expect(body.locked_by).toBeNull()
    expect(body.held_by_caller).toBe(false)
  })

  it('reports held_by_caller=true for the holder and holder details for others', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { user_id: bob.id, role: 'editor' },
    })

    const asAlice = await app.inject({
      method: 'GET',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const asBob = await app.inject({
      method: 'GET',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${bob.token}` },
    })

    expect((asAlice.json() as { held_by_caller: boolean }).held_by_caller).toBe(true)
    const bobBody = asBob.json() as {
      locked_by: string | null
      held_by_caller: boolean
      holder: { id: string; name: string | null } | null
    }
    expect(bobBody.locked_by).toBe(alice.id)
    expect(bobBody.held_by_caller).toBe(false)
    expect(bobBody.holder?.name).toBe('Alice')
  })
})

describe.skipIf(!dbReachable)('DELETE /specs/:id/lock', () => {
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

  it('releases the lock for the holder', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })

    const del = await app.inject({
      method: 'DELETE',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(del.statusCode).toBe(204)

    const get = await app.inject({
      method: 'GET',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect((get.json() as { locked_by: string | null }).locked_by).toBeNull()
  })

  it('returns 409 when the caller does not hold the lock', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'DELETE',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(409)
  })
})
