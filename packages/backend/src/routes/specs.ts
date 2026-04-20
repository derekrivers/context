import { and, asc, desc, eq, isNotNull, or } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  CanonicalSpecSchema,
  SCHEMA_VERSION,
  SpecStatusSchema,
  computeCompleteness,
  createEmptySpec,
  type CanonicalSpec,
} from '@context/spec-schema'
import type { Db } from '../db/pool.js'
import {
  conversationTurns,
  specHistory,
  specShares,
  specs,
  users,
  type Spec,
  type SpecShare,
  type User,
} from '../db/schema.js'
import { canWrite, loadSpecWithAccess, type Access } from '../lib/access.js'
import { computeDiff } from '../lib/diff.js'

export const LOCK_TTL_MS = 5 * 60 * 1000

const SpecIdParams = z.object({ id: z.string().uuid() })
const ShareParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() })

const CreateSpecBody = z.object({
  title: z.string().min(1),
})

const PatchSpecBody = z
  .object({
    title: z.string().min(1).optional(),
    status: SpecStatusSchema.optional(),
    spec: CanonicalSpecSchema.optional(),
  })
  .refine(
    (d) => d.title !== undefined || d.status !== undefined || d.spec !== undefined,
    { message: 'at least one of title, status, spec must be provided' },
  )

const ShareBody = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['viewer', 'editor']),
})

function authorFromUser(u: User): { id: string; name?: string; role?: string } {
  const short = u.id.replace(/-/g, '').slice(0, 8)
  const author: { id: string; name?: string; role?: string } = {
    id: `user_${short}`,
    role: u.role,
  }
  if (u.name) author.name = u.name
  return author
}

function serializeSpec(row: Spec): Record<string, unknown> {
  return {
    id: row.id,
    owner_id: row.ownerId,
    title: row.title,
    status: row.status,
    schema_version: row.schemaVersion,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    locked_by: row.lockedBy,
    lock_expires_at: row.lockExpiresAt?.toISOString() ?? null,
    spec: row.specJson as CanonicalSpec,
  }
}

function serializeSpecSummary(row: Spec, access: Access): Record<string, unknown> {
  const spec = row.specJson as CanonicalSpec
  const completeness = computeCompleteness(spec)
  const bySection: Record<string, number> = {}
  for (const [k, v] of Object.entries(completeness.bySection)) {
    bySection[k] = v.score
  }
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    owner_id: row.ownerId,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    access,
    completeness: { overall: completeness.overall, by_section: bySection },
  }
}

function serializeShare(row: SpecShare): Record<string, unknown> {
  return {
    spec_id: row.specId,
    user_id: row.userId,
    role: row.role,
    granted_at: row.grantedAt.toISOString(),
    granted_by: row.grantedBy,
  }
}

function isLockHeldBy(row: Spec, userId: string, now: Date): boolean {
  return (
    row.lockedBy === userId &&
    row.lockExpiresAt !== null &&
    row.lockExpiresAt.getTime() > now.getTime()
  )
}

function isLockedByOther(row: Spec, userId: string, now: Date): boolean {
  if (row.lockedBy === null || row.lockExpiresAt === null) return false
  if (row.lockExpiresAt.getTime() <= now.getTime()) return false
  return row.lockedBy !== userId
}

async function loadUser(db: Db, id: string | null): Promise<User | null> {
  if (!id) return null
  const rows = await db.client.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

async function buildLockConflict(
  db: Db,
  row: Spec,
): Promise<{ error: string; locked_by: { id: string; name: string | null } | null; lock_expires_at: string | null }> {
  const holder = await loadUser(db, row.lockedBy)
  return {
    error: 'locked by another user',
    locked_by: holder
      ? { id: holder.id, name: holder.name }
      : row.lockedBy
        ? { id: row.lockedBy, name: null }
        : null,
    lock_expires_at: row.lockExpiresAt?.toISOString() ?? null,
  }
}

function requireUserOr400(req: FastifyRequest, reply: FastifyReply): User | null {
  if (!req.authenticatedUser) {
    reply.code(400).send({ error: 'admin token does not map to a user' })
    return null
  }
  return req.authenticatedUser
}

export interface SpecRoutesOptions {
  db: Db
  now?: () => Date
}

export const specRoutes: FastifyPluginAsync<SpecRoutesOptions> = async (
  app,
  { db, now: nowFn = () => new Date() },
) => {
  app.post(
    '/specs',
    { preHandler: [app.requireAuth, app.requireRole(['editor'])] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const parsed = CreateSpecBody.safeParse(req.body)
      if (!parsed.success) {
        reply.code(400).send({ error: 'invalid body', details: parsed.error.flatten() })
        return
      }

      const now = nowFn()
      const spec = createEmptySpec({
        title: parsed.data.title,
        author: authorFromUser(user),
        now: () => now,
      })

      const inserted = await db.client
        .insert(specs)
        .values({
          id: spec.id,
          ownerId: user.id,
          title: spec.title,
          status: spec.status,
          schemaVersion: spec.schema_version,
          specJson: spec,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const row = inserted[0]
      if (!row) {
        reply.code(500).send({ error: 'spec insert returned no row' })
        return
      }

      await db.client.insert(specHistory).values({
        specId: row.id,
        authorId: user.id,
        diff: { changes: [{ path: '$', before: null, after: spec }] },
        specJsonAfter: spec,
        createdAt: now,
      })

      reply.code(201).send(serializeSpec(row))
    },
  )

  app.get('/specs', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const rows = await db.client
      .select({ spec: specs, shareRole: specShares.role })
      .from(specs)
      .leftJoin(
        specShares,
        and(eq(specShares.specId, specs.id), eq(specShares.userId, user.id)),
      )
      .where(or(eq(specs.ownerId, user.id), isNotNull(specShares.userId)))
      .orderBy(desc(specs.updatedAt))

    reply.send({
      specs: rows.map(({ spec, shareRole }) => {
        const access: Access =
          spec.ownerId === user.id ? 'owner' : (shareRole as 'editor' | 'viewer')
        return serializeSpecSummary(spec, access)
      }),
    })
  })

  app.get('/specs/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    reply.send({ ...serializeSpec(result.spec), access: result.access })
  })

  app.patch('/specs/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const body = PatchSpecBody.safeParse(req.body)
    if (!body.success) {
      reply.code(400).send({ error: 'invalid body', details: body.error.flatten() })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    if (!canWrite(result.access)) {
      reply.code(403).send({ error: 'forbidden' })
      return
    }

    const row = result.spec
    const now = nowFn()

    if (isLockedByOther(row, user.id, now)) {
      reply.code(409).send(await buildLockConflict(db, row))
      return
    }
    if (!isLockHeldBy(row, user.id, now)) {
      reply.code(409).send({ error: 'lock not held by caller' })
      return
    }

    let nextSpec: CanonicalSpec = row.specJson as CanonicalSpec

    if (body.data.spec) {
      const incoming = body.data.spec
      if (incoming.id !== row.id) {
        reply.code(400).send({ error: 'spec.id does not match route' })
        return
      }
      if (incoming.schema_version !== SCHEMA_VERSION) {
        reply.code(400).send({ error: `spec.schema_version must be "${SCHEMA_VERSION}"` })
        return
      }
      nextSpec = {
        ...incoming,
        id: row.id,
        schema_version: SCHEMA_VERSION,
        created_at: row.createdAt.toISOString(),
        updated_at: now.toISOString(),
      }
    } else {
      nextSpec = { ...nextSpec, updated_at: now.toISOString() }
    }

    const nextTitle = body.data.title ?? nextSpec.title
    const nextStatus = body.data.status ?? nextSpec.status
    nextSpec = { ...nextSpec, title: nextTitle, status: nextStatus }

    const diff = computeDiff(row.specJson, nextSpec)
    const META_ONLY = new Set(['updated_at'])
    const substantiveChange = diff.changes.some(
      (c) => c.path !== '$' && !META_ONLY.has(c.path),
    )
    const nextVersion = substantiveChange ? row.version + 1 : row.version

    const updated = await db.client
      .update(specs)
      .set({
        title: nextTitle,
        status: nextStatus,
        specJson: nextSpec,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(specs.id, row.id))
      .returning()

    const nextRow = updated[0]
    if (!nextRow) {
      reply.code(500).send({ error: 'spec update returned no row' })
      return
    }

    await db.client.insert(specHistory).values({
      specId: nextRow.id,
      authorId: user.id,
      diff,
      specJsonAfter: nextSpec,
      createdAt: now,
    })

    // direct_edit turn per changed path (excluding server-managed meta fields)
    const META_FIELDS = new Set(['updated_at', 'created_at', 'id', 'schema_version'])
    const changedPaths = diff.changes
      .map((c) => c.path)
      .filter((p) => p !== '$' && !META_FIELDS.has(p))
    if (changedPaths.length > 0) {
      const report = computeCompleteness(nextSpec)
      const bySection: Record<string, number> = {}
      for (const [k, v] of Object.entries(report.bySection)) bySection[k] = v.score
      const completenessSnapshot = { overall: report.overall, by_section: bySection }

      const existing = await db.client
        .select({ turnIndex: conversationTurns.turnIndex })
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, nextRow.id))
        .orderBy(asc(conversationTurns.turnIndex))
      let nextIndex = existing.length === 0 ? 0 : existing[existing.length - 1]!.turnIndex + 1

      for (const path of changedPaths) {
        const section = path.split(/[.[]/)[0] ?? ''
        await db.client.insert(conversationTurns).values({
          specId: nextRow.id,
          turnIndex: nextIndex,
          phase: 'direct_edit',
          targetPath: path,
          targetSection: section,
          outcome: 'answered',
          specSnapshot: nextSpec,
          completenessSnapshot,
          createdAt: now,
        })
        nextIndex += 1
      }
    }

    reply.send(serializeSpec(nextRow))
  })

  app.get('/specs/:id/history', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    const entries = await db.client
      .select()
      .from(specHistory)
      .where(eq(specHistory.specId, result.spec.id))
      .orderBy(desc(specHistory.createdAt), desc(specHistory.id))

    reply.send({
      entries: entries.map((e) => ({
        id: e.id.toString(),
        spec_id: e.specId,
        author_id: e.authorId,
        diff: e.diff,
        created_at: e.createdAt.toISOString(),
      })),
    })
  })

  app.post('/specs/:id/lock', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    if (!canWrite(result.access)) {
      reply.code(403).send({ error: 'forbidden' })
      return
    }

    const row = result.spec
    const now = nowFn()
    if (isLockedByOther(row, user.id, now)) {
      reply.code(409).send(await buildLockConflict(db, row))
      return
    }

    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)
    const updated = await db.client
      .update(specs)
      .set({ lockedBy: user.id, lockExpiresAt: expiresAt })
      .where(eq(specs.id, row.id))
      .returning()

    const nextRow = updated[0]
    if (!nextRow) {
      reply.code(500).send({ error: 'spec lock update returned no row' })
      return
    }

    reply.send({
      spec_id: nextRow.id,
      locked_by: nextRow.lockedBy,
      lock_expires_at: nextRow.lockExpiresAt?.toISOString() ?? null,
      lock_ttl_ms: LOCK_TTL_MS,
    })
  })

  app.get('/specs/:id/lock', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    const row = result.spec
    const now = nowFn()
    const expired =
      row.lockExpiresAt === null || row.lockExpiresAt.getTime() <= now.getTime()
    const heldBy = expired ? null : row.lockedBy
    const holder = await loadUser(db, heldBy)

    reply.send({
      spec_id: row.id,
      locked_by: heldBy,
      lock_expires_at: expired ? null : row.lockExpiresAt?.toISOString() ?? null,
      held_by_caller: heldBy === user.id,
      holder: holder ? { id: holder.id, name: holder.name } : null,
    })
  })

  app.delete('/specs/:id/lock', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    const row = result.spec
    if (row.lockedBy !== user.id) {
      reply.code(409).send({ error: 'lock not held by caller' })
      return
    }

    await db.client
      .update(specs)
      .set({ lockedBy: null, lockExpiresAt: null })
      .where(eq(specs.id, row.id))

    reply.code(204).send()
  })

  app.post('/specs/:id/shares', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const body = ShareBody.safeParse(req.body)
    if (!body.success) {
      reply.code(400).send({ error: 'invalid body', details: body.error.flatten() })
      return
    }

    const specRows = await db.client
      .select()
      .from(specs)
      .where(eq(specs.id, params.data.id))
      .limit(1)
    const spec = specRows[0]
    if (!spec) {
      reply.code(404).send({ error: 'not found' })
      return
    }
    if (spec.ownerId !== user.id) {
      reply.code(403).send({ error: 'forbidden' })
      return
    }

    if (body.data.user_id === user.id) {
      reply.code(400).send({ error: 'cannot share a spec with yourself' })
      return
    }

    const target = await loadUser(db, body.data.user_id)
    if (!target) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    if (body.data.role === 'editor' && target.role === 'viewer') {
      reply
        .code(400)
        .send({ error: 'cannot grant editor share to a user whose global role is viewer' })
      return
    }

    const now = nowFn()
    const existing = await db.client
      .select()
      .from(specShares)
      .where(and(eq(specShares.specId, spec.id), eq(specShares.userId, target.id)))
      .limit(1)

    if (existing[0]) {
      const updated = await db.client
        .update(specShares)
        .set({ role: body.data.role, grantedAt: now, grantedBy: user.id })
        .where(
          and(eq(specShares.specId, spec.id), eq(specShares.userId, target.id)),
        )
        .returning()
      const row = updated[0]
      if (!row) {
        reply.code(500).send({ error: 'share update returned no row' })
        return
      }
      reply.code(200).send(serializeShare(row))
      return
    }

    const inserted = await db.client
      .insert(specShares)
      .values({
        specId: spec.id,
        userId: target.id,
        role: body.data.role,
        grantedAt: now,
        grantedBy: user.id,
      })
      .returning()
    const row = inserted[0]
    if (!row) {
      reply.code(500).send({ error: 'share insert returned no row' })
      return
    }
    reply.code(201).send(serializeShare(row))
  })

  app.delete(
    '/specs/:id/shares/:userId',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const params = ShareParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid params' })
        return
      }

      const specRows = await db.client
        .select()
        .from(specs)
        .where(eq(specs.id, params.data.id))
        .limit(1)
      const spec = specRows[0]
      if (!spec) {
        reply.code(404).send({ error: 'not found' })
        return
      }
      if (spec.ownerId !== user.id) {
        reply.code(403).send({ error: 'forbidden' })
        return
      }

      const existing = await db.client
        .select()
        .from(specShares)
        .where(
          and(
            eq(specShares.specId, spec.id),
            eq(specShares.userId, params.data.userId),
          ),
        )
        .limit(1)
      if (!existing[0]) {
        reply.code(404).send({ error: 'share not found' })
        return
      }

      await db.client.transaction(async (tx) => {
        await tx
          .delete(specShares)
          .where(
            and(
              eq(specShares.specId, spec.id),
              eq(specShares.userId, params.data.userId),
            ),
          )
        await tx
          .update(specs)
          .set({ lockedBy: null, lockExpiresAt: null })
          .where(and(eq(specs.id, spec.id), eq(specs.lockedBy, params.data.userId)))
      })

      reply.code(204).send()
    },
  )

  app.get('/specs/:id/shares', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const user = requireUserOr400(req, reply)
    if (!user) return

    const params = SpecIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const result = await loadSpecWithAccess(db, params.data.id, user.id)
    if (!result) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    const rows = await db.client
      .select({
        userId: specShares.userId,
        role: specShares.role,
        grantedAt: specShares.grantedAt,
        grantedBy: specShares.grantedBy,
        userName: users.name,
      })
      .from(specShares)
      .innerJoin(users, eq(users.id, specShares.userId))
      .where(eq(specShares.specId, result.spec.id))
      .orderBy(desc(specShares.grantedAt))

    reply.send({
      shares: rows.map((r) => ({
        user_id: r.userId,
        user_display: r.userName ?? r.userId,
        role: r.role,
        granted_at: r.grantedAt.toISOString(),
        granted_by: r.grantedBy,
      })),
    })
  })
}
