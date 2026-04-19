import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { generateToken } from '../auth/tokens.js'
import type { Db } from '../db/pool.js'
import { users, type User } from '../db/schema.js'

const CreateUserBody = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['editor', 'viewer']),
})

const UserIdParams = z.object({
  id: z.string().uuid(),
})

function serializePublicUser(u: User): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    created_at: u.createdAt.toISOString(),
    token_rotated_at: u.tokenRotatedAt.toISOString(),
  }
}

export interface UserRoutesOptions {
  db: Db
}

export const userRoutes: FastifyPluginAsync<UserRoutesOptions> = async (app, { db }) => {
  app.post('/users', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = CreateUserBody.safeParse(req.body)
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid body', details: parsed.error.flatten() })
      return
    }

    const { plaintext, hash } = generateToken()
    const inserted = await db.client
      .insert(users)
      .values({
        name: parsed.data.name ?? null,
        role: parsed.data.role,
        tokenHash: hash,
      })
      .returning()

    const user = inserted[0]
    if (!user) {
      reply.code(500).send({ error: 'user insert returned no row' })
      return
    }

    reply.code(201).send({ ...serializePublicUser(user), token: plaintext })
  })

  app.post('/users/:id/rotate-token', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const params = UserIdParams.safeParse(req.params)
    if (!params.success) {
      reply.code(400).send({ error: 'invalid id' })
      return
    }

    const targetId = params.data.id
    const isSelf = req.authenticatedUser?.id === targetId
    if (!isSelf && !req.isAdmin) {
      reply.code(403).send({ error: 'forbidden' })
      return
    }

    const { plaintext, hash } = generateToken()
    const updated = await db.client
      .update(users)
      .set({ tokenHash: hash, tokenRotatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning()

    const user = updated[0]
    if (!user) {
      reply.code(404).send({ error: 'not found' })
      return
    }

    reply.code(200).send({
      id: user.id,
      token: plaintext,
      token_rotated_at: user.tokenRotatedAt.toISOString(),
    })
  })

  app.get('/users/me', { preHandler: [app.requireAuth] }, async (req, reply) => {
    if (!req.authenticatedUser) {
      reply.code(400).send({ error: 'admin token does not map to a user' })
      return
    }
    reply.send(serializePublicUser(req.authenticatedUser))
  })
}
