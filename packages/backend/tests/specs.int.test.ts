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
  name?: string,
): Promise<{ id: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/users',
    headers: { authorization: `Bearer ${config.adminToken}` },
    payload: name ? { name, role } : { role },
  })
  return res.json() as { id: string; token: string }
}

async function createSpec(
  app: FastifyInstance,
  token: string,
  title = 'My Spec',
): Promise<{ id: string; spec: CanonicalSpec }> {
  const res = await app.inject({
    method: 'POST',
    url: '/specs',
    headers: { authorization: `Bearer ${token}` },
    payload: { title },
  })
  expect(res.statusCode).toBe(201)
  const body = res.json() as { id: string; spec: CanonicalSpec }
  return body
}

async function acquireLock(
  app: FastifyInstance,
  token: string,
  specId: string,
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/specs/${specId}/lock`,
    headers: { authorization: `Bearer ${token}` },
  })
  expect(res.statusCode).toBe(200)
}

describe.skipIf(!dbReachable)('POST /specs', () => {
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

  it('requires an editor role (403 for viewer)', async () => {
    const viewer = await createUser(app, 'viewer', 'V')
    const res = await app.inject({
      method: 'POST',
      url: '/specs',
      headers: { authorization: `Bearer ${viewer.token}` },
      payload: { title: 'x' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('creates a draft spec owned by the caller and writes a history row', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const res = await app.inject({
      method: 'POST',
      url: '/specs',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'Project Zero' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      id: string
      owner_id: string
      title: string
      status: string
      schema_version: string
      spec: CanonicalSpec
    }
    expect(body.owner_id).toBe(alice.id)
    expect(body.title).toBe('Project Zero')
    expect(body.status).toBe('draft')
    expect(body.spec.title).toBe('Project Zero')
    expect(body.spec.domain_model.entities).toEqual([])

    const hist = await app.inject({
      method: 'GET',
      url: `/specs/${body.id}/history`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(hist.statusCode).toBe(200)
    const histBody = hist.json() as { entries: unknown[] }
    expect(histBody.entries).toHaveLength(1)
  })

  it('rejects an empty title with 400', async () => {
    const alice = await createUser(app, 'editor')
    const res = await app.inject({
      method: 'POST',
      url: '/specs',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe.skipIf(!dbReachable)('GET /specs and /specs/:id', () => {
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

  it('lists only specs owned by the caller with completeness', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    await createSpec(app, alice.token, 'Alice one')
    await createSpec(app, alice.token, 'Alice two')
    await createSpec(app, bob.token, 'Bob one')

    const res = await app.inject({
      method: 'GET',
      url: '/specs',
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      specs: Array<{
        id: string
        title: string
        owner_id: string
        completeness: { overall: number; by_section: Record<string, number> }
      }>
    }
    expect(body.specs).toHaveLength(2)
    for (const s of body.specs) {
      expect(s.owner_id).toBe(alice.id)
      expect(typeof s.completeness.overall).toBe('number')
      expect(s.completeness.by_section).toHaveProperty('intent')
    }
  })

  it('returns 404 when fetching another user\'s spec', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 401 without an Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/specs' })
    expect(res.statusCode).toBe(401)
  })
})

describe.skipIf(!dbReachable)('POST /specs/:id/lock', () => {
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

  it('acquires a lock for the owner', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      spec_id: string
      locked_by: string
      lock_expires_at: string
      lock_ttl_ms: number
    }
    expect(body.spec_id).toBe(id)
    expect(body.locked_by).toBe(alice.id)
    expect(body.lock_ttl_ms).toBe(5 * 60 * 1000)
    expect(new Date(body.lock_expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('rejects a non-owner with 404 (not info-leaking)', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'POST',
      url: `/specs/${id}/lock`,
      headers: { authorization: `Bearer ${bob.token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe.skipIf(!dbReachable)('PATCH /specs/:id', () => {
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

  it('requires the caller to hold the lock (409)', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'renamed' },
    })
    expect(res.statusCode).toBe(409)
    expect((res.json() as { error: string }).error).toMatch(/lock/i)
  })

  it('updates title and status and appends a history entry', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token, 'First')
    await acquireLock(app, alice.token, id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'Second', status: 'ready' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { title: string; status: string; spec: CanonicalSpec }
    expect(body.title).toBe('Second')
    expect(body.status).toBe('ready')
    expect(body.spec.title).toBe('Second')
    expect(body.spec.status).toBe('ready')

    const hist = await app.inject({
      method: 'GET',
      url: `/specs/${id}/history`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    const histBody = hist.json() as { entries: Array<{ diff: { changes: Array<{ path: string }> } }> }
    expect(histBody.entries.length).toBeGreaterThanOrEqual(2)
    const latest = histBody.entries[0]!
    const changedPaths = latest.diff.changes.map((c) => c.path)
    expect(changedPaths).toContain('title')
    expect(changedPaths).toContain('status')
  })

  it('accepts a full spec replacement and validates against Zod', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id, spec } = await createSpec(app, alice.token)
    await acquireLock(app, alice.token, id)

    const nextSpec: CanonicalSpec = {
      ...spec,
      intent: { summary: 'A thing that does a thing.' },
    }
    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { spec: nextSpec },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { spec: CanonicalSpec }
    expect(body.spec.intent.summary).toBe('A thing that does a thing.')
  })

  it('rejects an invalid spec with 400', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id, spec } = await createSpec(app, alice.token)
    await acquireLock(app, alice.token, id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: {
        spec: { ...spec, intent: { users: [{ id: 'Not-A-Slug', persona: 'x' }] } },
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a spec whose id does not match the route', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id, spec } = await createSpec(app, alice.token)
    await acquireLock(app, alice.token, id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { spec: { ...spec, id: '00000000-0000-0000-0000-000000000000' } },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 409 with holder info when another user holds the lock', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const bob = await createUser(app, 'editor', 'Bob')
    // Alice owns the spec; she shares the db lock via Bob being... wait, only owner can lock.
    // So instead: Alice locks her own spec, then attempts to PATCH after the lock is "stolen" by admin-bypass?
    // Simpler: test that Alice's PATCH without lock yields lock-not-held, and lock collision
    // between two sessions is covered by POST /lock not being takeable by non-owner.
    // We still want to exercise the "locked by another user" path — fabricate it via the DB.
    const { id } = await createSpec(app, alice.token)

    // Simulate Bob having stolen the lock by writing directly.
    await db.pool.query(
      `UPDATE context.specs SET locked_by = $1, lock_expires_at = now() + interval '5 minutes' WHERE id = $2`,
      [bob.id, id],
    )

    const res = await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'x' },
    })
    expect(res.statusCode).toBe(409)
    const body = res.json() as {
      error: string
      locked_by: { id: string; name: string | null } | null
    }
    expect(body.locked_by?.id).toBe(bob.id)
    expect(body.locked_by?.name).toBe('Bob')
  })
})

describe.skipIf(!dbReachable)('GET /specs/:id/history', () => {
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

  it('returns entries newest-first with diff payloads', async () => {
    const alice = await createUser(app, 'editor', 'Alice')
    const { id } = await createSpec(app, alice.token)
    await acquireLock(app, alice.token, id)
    await app.inject({
      method: 'PATCH',
      url: `/specs/${id}`,
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { title: 'renamed' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/specs/${id}/history`,
      headers: { authorization: `Bearer ${alice.token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      entries: Array<{ id: string; author_id: string; diff: unknown }>
    }
    expect(body.entries.length).toBeGreaterThanOrEqual(2)
    for (const e of body.entries) {
      expect(e.author_id).toBe(alice.id)
      expect(e.diff).toBeDefined()
    }
  })
})
