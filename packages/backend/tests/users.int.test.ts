import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.js'
import type { Db } from '../src/db/pool.js'
import { createTestDb, integrationConfig, probePostgres, resetTables } from './helpers/db.js'

const config = integrationConfig()
const dbReachable = await probePostgres(config)

describe.skipIf(!dbReachable)('POST /users (admin only)', () => {
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

  it('rejects requests without admin token with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { role: 'editor' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects a wrong admin token with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: 'Bearer not-the-admin-token' },
      payload: { role: 'editor' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('creates a user and returns a plaintext token exactly once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${config.adminToken}` },
      payload: { name: 'Alice', role: 'editor' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      id: string
      name: string
      role: string
      token: string
      created_at: string
      token_rotated_at: string
    }
    expect(body.role).toBe('editor')
    expect(body.token.startsWith('ctx_')).toBe(true)
    expect(body).not.toHaveProperty('token_hash')
  })

  it('rejects an invalid role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${config.adminToken}` },
      payload: { role: 'overlord' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe.skipIf(!dbReachable)('bearer auth + GET /users/me', () => {
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

  async function createUser(role: 'editor' | 'viewer', name?: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${config.adminToken}` },
      payload: name ? { name, role } : { role },
    })
    const body = res.json() as { id: string; token: string }
    return body
  }

  it('returns 401 without an Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for an unknown token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: 'Bearer ctx_nonexistent' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('distinguishes two users by token', async () => {
    const alice = await createUser('editor', 'Alice')
    const bob = await createUser('viewer', 'Bob')

    const a = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const b = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${bob.token}` },
    })

    expect(a.statusCode).toBe(200)
    expect(b.statusCode).toBe(200)
    const aBody = a.json() as { id: string; role: string; name: string }
    const bBody = b.json() as { id: string; role: string; name: string }
    expect(aBody.id).toBe(alice.id)
    expect(aBody.role).toBe('editor')
    expect(bBody.id).toBe(bob.id)
    expect(bBody.role).toBe('viewer')
    expect(aBody.id).not.toBe(bBody.id)
  })

  it('returns 400 for /users/me when authenticated only as admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${config.adminToken}` },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe.skipIf(!dbReachable)('POST /users/:id/rotate-token', () => {
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

  async function createUser(role: 'editor' | 'viewer'): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${config.adminToken}` },
      payload: { role },
    })
    return res.json() as { id: string; token: string }
  }

  it('allows self-rotation and invalidates the old token', async () => {
    const alice = await createUser('editor')

    const rotate = await app.inject({
      method: 'POST',
      url: `/users/${alice.id}/rotate-token`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(rotate.statusCode).toBe(200)
    const body = rotate.json() as { id: string; token: string }
    expect(body.id).toBe(alice.id)
    expect(body.token).not.toBe(alice.token)

    const withOld = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(withOld.statusCode).toBe(401)

    const withNew = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${body.token}` },
    })
    expect(withNew.statusCode).toBe(200)
  })

  it('forbids rotating another user with 403', async () => {
    const alice = await createUser('editor')
    const bob = await createUser('viewer')

    const res = await app.inject({
      method: 'POST',
      url: `/users/${bob.id}/rotate-token`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows admin to rotate any user', async () => {
    const alice = await createUser('editor')

    const res = await app.inject({
      method: 'POST',
      url: `/users/${alice.id}/rotate-token`,
      headers: { authorization: `Bearer ${config.adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { id: string; token: string }
    expect(body.id).toBe(alice.id)
    expect(body.token).not.toBe(alice.token)
  })

  it('returns 401 when unauthenticated', async () => {
    const alice = await createUser('editor')
    const res = await app.inject({
      method: 'POST',
      url: `/users/${alice.id}/rotate-token`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe.skipIf(!dbReachable)('requireRole guard', () => {
  let app: FastifyInstance
  let db: Db

  beforeAll(async () => {
    db = createTestDb(config)
    app = await buildServer({ config, db })
    app.get(
      '/internal/editor-only',
      { preHandler: [app.requireRole(['editor'])] },
      async () => ({ ok: true }),
    )
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await db.pool.end()
  })

  beforeEach(async () => {
    await resetTables(db)
  })

  async function createUser(role: 'editor' | 'viewer'): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${config.adminToken}` },
      payload: { role },
    })
    return res.json() as { id: string; token: string }
  }

  it('allows an editor through', async () => {
    const alice = await createUser('editor')
    const res = await app.inject({
      method: 'GET',
      url: '/internal/editor-only',
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('blocks a viewer with 403', async () => {
    const bob = await createUser('viewer')
    const res = await app.inject({
      method: 'GET',
      url: '/internal/editor-only',
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('blocks unauthenticated callers with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/editor-only' })
    expect(res.statusCode).toBe(401)
  })

  it('lets admin through regardless of role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/editor-only',
      headers: { authorization: `Bearer ${config.adminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })
})
