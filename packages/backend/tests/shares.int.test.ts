import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { CanonicalSpec } from '@context/spec-schema'
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

async function createSpec(
  app: FastifyInstance,
  token: string,
  title = 'Shared Spec',
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

async function share(
  app: FastifyInstance,
  ownerToken: string,
  specId: string,
  userId: string,
  role: 'viewer' | 'editor',
): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'POST',
    url: `/specs/${specId}/shares`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { user_id: userId, role },
  })
  return { status: res.statusCode, body: res.json() }
}

describe.skipIf(!dbReachable)('POST /specs/:id/shares', () => {
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

  it('grants a viewer share and returns 201', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const { status, body } = await share(app, alice.token, id, bob.id, 'viewer')
    expect(status).toBe(201)
    expect(body).toMatchObject({
      spec_id: id,
      user_id: bob.id,
      role: 'viewer',
      granted_by: alice.id,
    })
  })

  it('returns 403 when a non-owner attempts to share', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const carol = await createUser(app, 'editor', 'Carol')
    const { id } = await createSpec(app, alice.token)

    const { status } = await share(app, bob.token, id, carol.id, 'viewer')
    expect(status).toBe(403)
  })

  it('returns 400 when sharing an editor role with a global viewer', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'viewer', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const { status, body } = await share(app, alice.token, id, bob.id, 'editor')
    expect(status).toBe(400)
    expect((body as { error: string }).error).toMatch(/editor/i)
  })

  it('allows viewer share to a global viewer', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'viewer', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const { status } = await share(app, alice.token, id, bob.id, 'viewer')
    expect(status).toBe(201)
  })

  it('returns 400 when owner attempts to share with themselves', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const { status } = await share(app, alice.token, id, alice.id, 'editor')
    expect(status).toBe(400)
  })

  it('returns 404 when the target user does not exist', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)

    const { status } = await share(
      app,
      alice.token,
      id,
      '00000000-0000-0000-0000-000000000000',
      'viewer',
    )
    expect(status).toBe(404)
  })

  it('upserts on re-share: returns 200 with the new role, no duplicate rows', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const first = await share(app, alice.token, id, bob.id, 'viewer')
    expect(first.status).toBe(201)

    const second = await share(app, alice.token, id, bob.id, 'editor')
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ role: 'editor', user_id: bob.id })

    const { rows } = await db.pool.query(
      'SELECT count(*)::int as n FROM context.spec_shares WHERE spec_id = $1 AND user_id = $2',
      [id, bob.id],
    )
    expect(rows[0].n).toBe(1)
  })
})

describe.skipIf(!dbReachable)('DELETE /specs/:id/shares/:userId', () => {
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

  it('removes the share with 204 and releases any lock the target holds', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'editor')

    // Bob acquires the lock
    const lockRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(lockRes.statusCode).toBe(200)

    const del = await app.inject({
      method: 'DELETE',
      url: `/specs/${id}/shares/${bob.id}`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(del.statusCode).toBe(204)

    const { rows } = await db.pool.query(
      'SELECT locked_by, lock_expires_at FROM context.specs WHERE id = $1',
      [id],
    )
    expect(rows[0].locked_by).toBeNull()
    expect(rows[0].lock_expires_at).toBeNull()
  })

  it('returns 404 when the share does not exist', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const del = await app.inject({
      method: 'DELETE',
      url: `/specs/${id}/shares/${bob.id}`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(del.statusCode).toBe(404)
  })
})

describe.skipIf(!dbReachable)('GET /specs/:id/shares', () => {
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

  it('returns share rows with user_display to the owner', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'editor')

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      shares: Array<{ user_id: string; user_display: string; role: string }>
    }
    expect(body.shares).toHaveLength(1)
    expect(body.shares[0]).toMatchObject({
      user_id: bob.id,
      user_display: 'Bob',
      role: 'editor',
    })
  })

  it('allows a share-holder to see the list', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'viewer')

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/shares`,
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
      url: `/specs/${id}/shares`,
      headers: { authorization: `Bearer ${carol.token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe.skipIf(!dbReachable)('GET /specs — shared rows and access field', () => {
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

  it('includes shared rows with the correct access, and omits them after DELETE', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const owned = await createSpec(app, bob.token, 'Bobs own')
    const { id: sharedId } = await createSpec(app, alice.token, 'Alices gift')
    await share(app, alice.token, sharedId, bob.id, 'editor')

    const listed = await app.inject({
      method: 'GET',
      url: '/specs',
      headers: { authorization: `Bearer ${bob.token}` },
    })
    const body = listed.json() as {
      specs: Array<{ id: string; access: 'owner' | 'editor' | 'viewer' }>
    }
    const byId = Object.fromEntries(body.specs.map((s) => [s.id, s]))
    expect(byId[owned.id]?.access).toBe('owner')
    expect(byId[sharedId]?.access).toBe('editor')

    await app.inject({
      method: 'DELETE',
      url: `/specs/${sharedId}/shares/${bob.id}`,
      headers: { authorization: `Bearer ${alice.token}` },
    })

    const after = await app.inject({
      method: 'GET',
      url: '/specs',
      headers: { authorization: `Bearer ${bob.token}` },
    })
    const afterBody = after.json() as { specs: Array<{ id: string }> }
    expect(afterBody.specs.map((s) => s.id)).not.toContain(sharedId)
  })

  it('exposes access=viewer on shared specs and blocks editor writes', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'viewer')

    const get = await app.inject({
      method: 'GET',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(get.statusCode).toBe(200)
    expect((get.json() as { access: string }).access).toBe('viewer')

    const lockRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(lockRes.statusCode).toBe(403)

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${bob.token}` },
      payload: { title: 'nope' },
    })
    expect(patchRes.statusCode).toBe(403)
  })

  it('editor share can acquire lock and PATCH the spec', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'editor')

    const lockRes = await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(lockRes.statusCode).toBe(200)

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${bob.token}` },
      payload: { title: 'renamed by editor-share' },
    })
    expect(patchRes.statusCode).toBe(200)
    expect((patchRes.json() as { title: string }).title).toBe('renamed by editor-share')
  })
})

describe.skipIf(!dbReachable)('cascading deletes', () => {
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

  it('deleting a spec removes its share rows', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'viewer')

    await db.pool.query('DELETE FROM context.specs WHERE id = $1', [id])

    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM context.spec_shares WHERE spec_id = $1',
      [id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('deleting a (non-owner) user removes their share rows', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    await share(app, alice.token, id, bob.id, 'viewer')

    await db.pool.query('DELETE FROM context.users WHERE id = $1', [bob.id])

    const { rows } = await db.pool.query(
      'SELECT count(*)::int AS n FROM context.spec_shares WHERE user_id = $1',
      [bob.id],
    )
    expect(rows[0].n).toBe(0)
  })
})
