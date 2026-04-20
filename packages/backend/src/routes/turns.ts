import { asc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  nextTurn,
  recordSkip,
  recordUnskip,
  SpecNotFoundError,
} from '../conversation/engine.js'
import type { Db } from '../db/pool.js'
import { conversationTurns, type ConversationTurn, type User } from '../db/schema.js'
import { canWrite, loadSpecWithAccess } from '../lib/access.js'

const SpecIdParams = z.object({ id: z.string().uuid() })
const SkipParams = z.object({ id: z.string().uuid(), turnId: z.string().uuid() })
const UnskipBody = z.object({ path: z.string().min(1) })

function requireUserOr400(req: FastifyRequest, reply: FastifyReply): User | null {
  if (!req.authenticatedUser) {
    reply.code(400).send({ error: 'admin token does not map to a user' })
    return null
  }
  return req.authenticatedUser
}

function serializeTurn(row: ConversationTurn): Record<string, unknown> {
  return {
    id: row.id,
    spec_id: row.specId,
    turn_index: row.turnIndex,
    created_at: row.createdAt.toISOString(),
    phase: row.phase,
    target_path: row.targetPath,
    target_section: row.targetSection,
    selection_reason: row.selectionReason,
    outcome: row.outcome,
    llm_model_id: row.llmModelId,
    llm_tokens_in: row.llmTokensIn,
    llm_tokens_out: row.llmTokensOut,
  }
}

export interface TurnRoutesOptions {
  db: Db
  now?: () => Date
}

export const turnRoutes: FastifyPluginAsync<TurnRoutesOptions> = async (
  app,
  { db, now: nowFn = () => new Date() },
) => {
  app.post(
    '/specs/:id/turns/next',
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
      if (!canWrite(access.access)) {
        reply.code(403).send({ error: 'forbidden' })
        return
      }

      try {
        const result = await nextTurn(db, params.data.id, { now: nowFn })
        if (result === null) {
          reply.code(204).send()
          return
        }
        reply.send({
          turn_id: result.turnId,
          turn_index: result.turnIndex,
          target_field: result.selection.targetField,
          context: result.selection.context,
          reason: result.selection.reason,
        })
      } catch (err) {
        if (err instanceof SpecNotFoundError) {
          reply.code(404).send({ error: 'not found' })
          return
        }
        throw err
      }
    },
  )

  app.post(
    '/specs/:id/turns/:turnId/skip',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const params = SkipParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid params' })
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

      const skipRow = await recordSkip({
        db,
        specId: params.data.id,
        selectionTurnId: params.data.turnId,
        now: nowFn,
      })
      if (!skipRow) {
        reply
          .code(404)
          .send({ error: 'selection turn not found or not skippable' })
        return
      }
      reply.code(201).send(serializeTurn(skipRow))
    },
  )

  app.post(
    '/specs/:id/turns/unskip',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const params = SpecIdParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid id' })
        return
      }

      const body = UnskipBody.safeParse(req.body)
      if (!body.success) {
        reply
          .code(400)
          .send({ error: 'invalid body', details: body.error.flatten() })
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

      const row = await recordUnskip({
        db,
        specId: params.data.id,
        path: body.data.path,
        now: nowFn,
      })
      if (!row) {
        reply.code(400).send({ error: 'no prior skip for this path' })
        return
      }
      reply.code(201).send(serializeTurn(row))
    },
  )

  app.get(
    '/specs/:id/turns',
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

      const rows = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, params.data.id))
        .orderBy(asc(conversationTurns.turnIndex))

      reply.send({ turns: rows.map(serializeTurn) })
    },
  )
}
