import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { Db } from '../db/pool.js'
import { users, type User } from '../db/schema.js'
import { constantTimeEquals, hashToken, parseBearerToken } from './tokens.js'

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser?: User
    isAdmin?: boolean
  }

  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireRole: (
      roles: ReadonlyArray<User['role']>,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface AuthPluginOptions {
  db: Db
  adminToken: string
}

const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  const { db, adminToken } = opts

  async function attachIdentity(req: FastifyRequest): Promise<void> {
    const token = parseBearerToken(req.headers.authorization)
    if (!token) return

    if (constantTimeEquals(token, adminToken)) {
      req.isAdmin = true
      return
    }

    const hash = hashToken(token)
    const rows = await db.client
      .select()
      .from(users)
      .where(eq(users.tokenHash, hash))
      .limit(1)
    const user = rows[0]
    if (user) {
      req.authenticatedUser = user
    }
  }

  app.addHook('preHandler', attachIdentity)

  app.decorate(
    'requireAuth',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.authenticatedUser && !req.isAdmin) {
        reply.code(401).send({ error: 'unauthorized' })
      }
    },
  )

  app.decorate(
    'requireRole',
    (roles: ReadonlyArray<User['role']>) =>
      async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (req.isAdmin) return
        if (!req.authenticatedUser) {
          reply.code(401).send({ error: 'unauthorized' })
          return
        }
        if (!roles.includes(req.authenticatedUser.role)) {
          reply.code(403).send({ error: 'forbidden' })
        }
      },
  )

  app.decorate(
    'requireAdmin',
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.isAdmin) {
        reply.code(403).send({ error: 'admin token required' })
      }
    },
  )
}

export const authPlugin = fp(authPluginImpl, { name: 'context-auth' })
