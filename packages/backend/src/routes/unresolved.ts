import { and, asc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { CanonicalSpec } from '@context/spec-schema'
import type { Db } from '../db/pool.js'
import { conversationTurns, specs, type ConversationTurn, type User } from '../db/schema.js'
import { canWrite, loadSpecWithAccess } from '../lib/access.js'

const SpecIdParams = z.object({ id: z.string().uuid() })
const RetryBody = z.object({ path: z.string().min(1) })

function requireUserOr400(req: FastifyRequest, reply: FastifyReply): User | null {
  if (!req.authenticatedUser) {
    reply.code(400).send({ error: 'admin token does not map to a user' })
    return null
  }
  return req.authenticatedUser
}

function unknownByPath(spec: CanonicalSpec): Map<string, string> {
  const out = new Map<string, string>()
  for (const q of spec.provenance.unresolved_questions) {
    if (q.state === 'unanswerable') out.set(q.path, q.reason)
  }
  return out
}

interface UnresolvedEntry {
  path: string
  section: string | null
  last_asked_at: string
  last_question: string | null
  reason: 'retry_budget_exhausted' | 'user_marked_unanswerable'
  retries_attempted: number
}

function computeUnresolved(
  spec: CanonicalSpec,
  turns: ConversationTurn[],
): UnresolvedEntry[] {
  const byPath = new Map<string, ConversationTurn[]>()
  for (const t of turns) {
    if (!t.targetPath) continue
    const list = byPath.get(t.targetPath) ?? []
    list.push(t)
    byPath.set(t.targetPath, list)
  }

  const unknown = unknownByPath(spec)
  const entries: UnresolvedEntry[] = []

  for (const [path, pathTurns] of byPath) {
    let lastRetryIndex = -1
    for (let i = pathTurns.length - 1; i >= 0; i--) {
      const t = pathTurns[i]!
      if (t.phase === 'retry_request') {
        lastRetryIndex = t.turnIndex
        break
      }
    }
    const windowed = pathTurns.filter((t) => t.turnIndex > lastRetryIndex)
    const badCount = windowed.filter(
      (t) => t.outcome === 'unparseable' || t.outcome === 'clarification_requested',
    ).length
    const answered = windowed.some((t) => t.outcome === 'answered')

    let lastAskedTurn: ConversationTurn | undefined
    for (let i = pathTurns.length - 1; i >= 0; i--) {
      const t = pathTurns[i]!
      if (t.phase === 'selection') {
        lastAskedTurn = t
        break
      }
    }

    if (unknown.has(path) && !answered) {
      entries.push({
        path,
        section: lastAskedTurn?.targetSection ?? null,
        last_asked_at: (lastAskedTurn?.createdAt ?? pathTurns[pathTurns.length - 1]!.createdAt).toISOString(),
        last_question: lastAskedTurn?.questionText ?? null,
        reason: 'user_marked_unanswerable',
        retries_attempted: 0,
      })
      continue
    }

    if (badCount >= 3 && !answered) {
      entries.push({
        path,
        section: lastAskedTurn?.targetSection ?? null,
        last_asked_at: (lastAskedTurn?.createdAt ?? pathTurns[pathTurns.length - 1]!.createdAt).toISOString(),
        last_question: lastAskedTurn?.questionText ?? null,
        reason: 'retry_budget_exhausted',
        retries_attempted: badCount,
      })
    }
  }

  // Paths marked unanswerable that have no turn history yet
  for (const [path, _reason] of unknown) {
    void _reason
    if (byPath.has(path)) continue
    entries.push({
      path,
      section: path.split(/[.[]/)[0] ?? null,
      last_asked_at: new Date().toISOString(),
      last_question: null,
      reason: 'user_marked_unanswerable',
      retries_attempted: 0,
    })
  }

  entries.sort((a, b) => (a.last_asked_at < b.last_asked_at ? 1 : -1))
  return entries
}

export interface UnresolvedRoutesOptions {
  db: Db
  now?: () => Date
}

export const unresolvedRoutes: FastifyPluginAsync<UnresolvedRoutesOptions> = async (
  app,
  { db, now: nowFn = () => new Date() },
) => {
  app.get(
    '/specs/:id/unresolved',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return
      const params = SpecIdParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid id' })
        return
      }
      const access = await loadSpecWithAccess(db, params.data.id, user.id)
      if (!access) {
        reply.code(404).send({ error: 'not found' })
        return
      }

      const turns = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, params.data.id))
        .orderBy(asc(conversationTurns.turnIndex))
      const spec = access.spec.specJson as CanonicalSpec
      const entries = computeUnresolved(spec, turns)
      reply.send({ entries })
    },
  )

  app.post(
    '/specs/:id/fields/retry',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return
      const params = SpecIdParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid id' })
        return
      }
      const body = RetryBody.safeParse(req.body)
      if (!body.success) {
        reply.code(400).send({ error: 'invalid body', details: body.error.flatten() })
        return
      }
      const access = await loadSpecWithAccess(db, params.data.id, user.id)
      if (!access) {
        reply.code(404).send({ error: 'not found' })
        return
      }
      if (!canWrite(access.access)) {
        reply.code(403).send({ error: 'forbidden' })
        return
      }

      const turns = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, params.data.id))
        .orderBy(asc(conversationTurns.turnIndex))
      const spec = access.spec.specJson as CanonicalSpec
      const entries = computeUnresolved(spec, turns)
      const hit = entries.find((e) => e.path === body.data.path)
      if (!hit) {
        reply
          .code(400)
          .send({ error: 'path is not currently in the unresolved set' })
        return
      }

      const nextIndex =
        turns.length === 0 ? 0 : turns[turns.length - 1]!.turnIndex + 1

      await db.client.insert(conversationTurns).values({
        specId: params.data.id,
        turnIndex: nextIndex,
        phase: 'retry_request',
        targetPath: body.data.path,
        targetSection: hit.section,
        outcome: null,
        createdAt: nowFn(),
      })

      // If the path was marked unanswerable in the spec, clear the
      // provenance entry so the conversation can ask it again.
      const filteredUnresolved = spec.provenance.unresolved_questions.filter(
        (q) => !(q.path === body.data.path && q.state === 'unanswerable'),
      )
      if (filteredUnresolved.length !== spec.provenance.unresolved_questions.length) {
        const nextSpec: CanonicalSpec = {
          ...spec,
          provenance: { ...spec.provenance, unresolved_questions: filteredUnresolved },
          updated_at: nowFn().toISOString(),
        }
        await db.client
          .update(specs)
          .set({ specJson: nextSpec, updatedAt: nowFn() })
          .where(eq(specs.id, params.data.id))
      }

      void and // reserved for future joins

      reply.send({ path: body.data.path, retry_cleared: true })
    },
  )
}
