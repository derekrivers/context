import { asc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  nextTurn,
  recordAnswerTurn,
  recordPhraseTokens,
  recordSkip,
  recordUnskip,
  SpecNotFoundError,
  type NextTurnOutcome,
} from '../conversation/engine.js'
import { applyFieldUpdates, SpecApplyError } from '../conversation/apply.js'
import { parseAnswer } from '../conversation/parse.js'
import { phraseQuestion } from '../conversation/phrase.js'
import type { LlmClient } from '../llm/client.js'
import { LlmRateLimitError, LlmTimeoutError } from '../llm/client.js'
import type { Db } from '../db/pool.js'
import { conversationTurns, specs, type ConversationTurn, type User } from '../db/schema.js'
import { canWrite, loadSpecWithAccess } from '../lib/access.js'
import type { CanonicalSpec } from '@context/spec-schema'

const SpecIdParams = z.object({ id: z.string().uuid() })
const SkipParams = z.object({ id: z.string().uuid(), turnId: z.string().uuid() })
const PhraseParams = z.object({ id: z.string().uuid(), turnId: z.string().uuid() })
const UnskipBody = z.object({ path: z.string().min(1) })
const AnswerBody = z.object({
  turn_id: z.string().uuid(),
  user_text: z.string().min(1),
})

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
    question_text: row.questionText,
    user_text: row.userText,
  }
}

function renderNextOutcome(outcome: NextTurnOutcome): { status: number; body?: Record<string, unknown> } {
  switch (outcome.kind) {
    case 'selection':
      return {
        status: 200,
        body: {
          kind: 'selection',
          turn_id: outcome.turnId,
          turn_index: outcome.turnIndex,
          target_field: outcome.selection.targetField,
          context: outcome.selection.context,
          reason: outcome.selection.reason,
        },
      }
    case 'complete':
      return { status: 204 }
    case 'turn_cap_reached':
      return {
        status: 200,
        body: {
          kind: 'turn_cap_reached',
          turn_count: outcome.turnCount,
          limit: outcome.limit,
        },
      }
    case 'token_cap_reached':
      return {
        status: 200,
        body: {
          kind: 'token_cap_reached',
          token_count: outcome.tokenCount,
          limit: outcome.limit,
        },
      }
  }
}

function selectionFromRow(row: ConversationTurn): import('../conversation/types.js').Selection | null {
  if (row.phase !== 'selection' || !row.targetPath || !row.targetSection) return null
  const reason = row.selectionReason as import('../conversation/types.js').SelectionReason | null
  if (!reason) return null
  return {
    targetField: {
      path: row.targetPath,
      section: row.targetSection as import('../conversation/types.js').Selection['targetField']['section'],
      schemaRef: row.targetPath,
      importance: 'medium',
    },
    context: { surroundingSpec: null, relatedFields: [], recentTurns: [] },
    reason,
  }
}

export interface TurnRoutesOptions {
  db: Db
  llm: {
    client: LlmClient
    phraseModel: string
    parseModel: string
  }
  maxTurnsPerSpec: number
  maxTokensPerSpec: number
  now?: () => Date
}

export const turnRoutes: FastifyPluginAsync<TurnRoutesOptions> = async (
  app,
  { db, llm, maxTurnsPerSpec, maxTokensPerSpec, now: nowFn = () => new Date() },
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
        const outcome = await nextTurn(db, params.data.id, {
          now: nowFn,
          maxTurnsPerSpec,
          maxTokensPerSpec,
        })
        const rendered = renderNextOutcome(outcome)
        if (rendered.body) reply.code(rendered.status).send(rendered.body)
        else reply.code(rendered.status).send()
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
    '/specs/:id/turns/:turnId/phrase',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const params = PhraseParams.safeParse(req.params)
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

      const selRows = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.id, params.data.turnId))
        .limit(1)
      const selRow = selRows[0]
      if (!selRow || selRow.specId !== params.data.id) {
        reply.code(404).send({ error: 'selection turn not found' })
        return
      }
      const selection = selectionFromRow(selRow)
      if (!selection) {
        reply.code(400).send({ error: 'turn is not a selection turn' })
        return
      }

      const spec = access.spec.specJson as CanonicalSpec
      const history = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, params.data.id))
        .orderBy(asc(conversationTurns.turnIndex))

      try {
        const result = await phraseQuestion(
          llm.client,
          selection,
          spec,
          history,
          llm.phraseModel,
        )
        await recordPhraseTokens({
          db,
          selectionTurnId: params.data.turnId,
          modelId: result.modelId,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          questionText: result.text,
        })
        reply.send({
          text: result.text,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          model_id: result.modelId,
        })
      } catch (err) {
        if (err instanceof LlmTimeoutError) {
          reply.code(504).send({ error: 'llm timeout' })
          return
        }
        if (err instanceof LlmRateLimitError) {
          reply.code(429).send({ error: 'llm rate-limited' })
          return
        }
        throw err
      }
    },
  )

  app.post(
    '/specs/:id/turns/answer',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const user = requireUserOr400(req, reply)
      if (!user) return

      const params = SpecIdParams.safeParse(req.params)
      if (!params.success) {
        reply.code(400).send({ error: 'invalid id' })
        return
      }
      const body = AnswerBody.safeParse(req.body)
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

      const selRows = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.id, body.data.turn_id))
        .limit(1)
      const selRow = selRows[0]
      if (!selRow || selRow.specId !== params.data.id) {
        reply.code(404).send({ error: 'selection turn not found' })
        return
      }
      const selection = selectionFromRow(selRow)
      if (!selection) {
        reply.code(400).send({ error: 'turn is not a selection turn' })
        return
      }

      const specRow = await db.client
        .select()
        .from(specs)
        .where(eq(specs.id, params.data.id))
        .limit(1)
      const spec = specRow[0]!.specJson as CanonicalSpec

      const history = await db.client
        .select()
        .from(conversationTurns)
        .where(eq(conversationTurns.specId, params.data.id))
        .orderBy(asc(conversationTurns.turnIndex))

      let parseResult
      try {
        parseResult = await parseAnswer(
          llm.client,
          selection,
          body.data.user_text,
          spec,
          history,
          llm.parseModel,
        )
      } catch (err) {
        if (err instanceof LlmTimeoutError) {
          reply.code(504).send({ error: 'llm timeout' })
          return
        }
        if (err instanceof LlmRateLimitError) {
          reply.code(429).send({ error: 'llm rate-limited' })
          return
        }
        throw err
      }

      if (parseResult.kind === 'update') {
        try {
          await applyFieldUpdates({
            db,
            specId: params.data.id,
            authorId: user.id,
            updates: parseResult.updates,
            now: nowFn,
          })
        } catch (err) {
          if (err instanceof SpecApplyError) {
            reply.code(200).send({
              kind: 'clarification',
              question:
                'I tried to apply that but the result did not fit the schema — could you clarify?',
              reason: 'insufficient_detail',
              tokens_in: parseResult.tokensIn,
              tokens_out: parseResult.tokensOut,
              model_id: parseResult.modelId,
              apply_failures: err.failures,
            })
            return
          }
          throw err
        }
        await recordAnswerTurn({
          db,
          specId: params.data.id,
          selectionTurnId: body.data.turn_id,
          phase: 'answer',
          outcome: 'answered',
          modelId: parseResult.modelId,
          tokensIn: parseResult.tokensIn,
          tokensOut: parseResult.tokensOut,
          now: nowFn,
          userText: body.data.user_text,
        })
        reply.send({
          kind: 'update',
          updates: parseResult.updates,
          tokens_in: parseResult.tokensIn,
          tokens_out: parseResult.tokensOut,
          model_id: parseResult.modelId,
        })
        return
      }

      if (parseResult.kind === 'clarification') {
        await recordAnswerTurn({
          db,
          specId: params.data.id,
          selectionTurnId: body.data.turn_id,
          phase: 'clarification',
          outcome: 'clarification_requested',
          modelId: parseResult.modelId,
          tokensIn: parseResult.tokensIn,
          tokensOut: parseResult.tokensOut,
          now: nowFn,
          userText: body.data.user_text,
        })
        reply.send({
          kind: 'clarification',
          question: parseResult.question,
          reason: parseResult.reason,
          tokens_in: parseResult.tokensIn,
          tokens_out: parseResult.tokensOut,
          model_id: parseResult.modelId,
        })
        return
      }

      if (parseResult.kind === 'skip') {
        await recordAnswerTurn({
          db,
          specId: params.data.id,
          selectionTurnId: body.data.turn_id,
          phase: 'skip',
          outcome: 'skipped',
          modelId: parseResult.modelId,
          tokensIn: parseResult.tokensIn,
          tokensOut: parseResult.tokensOut,
          now: nowFn,
          userText: body.data.user_text,
        })
        reply.send({
          kind: 'skip',
          tokens_in: parseResult.tokensIn,
          tokens_out: parseResult.tokensOut,
          model_id: parseResult.modelId,
        })
        return
      }

      // unknown: write an "unanswerable" provenance entry on the field
      const unknownUpdate = {
        path: selection.targetField.path,
        value: undefined,
        confidence: 'low' as const,
      }
      void unknownUpdate
      // Add to provenance.unresolved_questions as state: unanswerable
      const nextSpec: CanonicalSpec = {
        ...spec,
        provenance: {
          ...spec.provenance,
          unresolved_questions: [
            ...spec.provenance.unresolved_questions,
            {
              id: `q_${nowFn().getTime()}`,
              path: selection.targetField.path,
              reason: parseResult.reason,
              state: 'unanswerable',
              created_at: nowFn().toISOString(),
            },
          ],
        },
      }
      await db.client
        .update(specs)
        .set({ specJson: nextSpec, updatedAt: nowFn() })
        .where(eq(specs.id, params.data.id))

      await recordAnswerTurn({
        db,
        specId: params.data.id,
        selectionTurnId: body.data.turn_id,
        phase: 'answer',
        outcome: 'answered',
        modelId: parseResult.modelId,
        tokensIn: parseResult.tokensIn,
        tokensOut: parseResult.tokensOut,
        now: nowFn,
          userText: body.data.user_text,
      })
      reply.send({
        kind: 'unknown',
        reason: parseResult.reason,
        tokens_in: parseResult.tokensIn,
        tokens_out: parseResult.tokensOut,
        model_id: parseResult.modelId,
      })
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
