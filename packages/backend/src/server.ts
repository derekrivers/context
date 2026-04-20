import Fastify, { type FastifyInstance } from 'fastify'
import { authPlugin } from './auth/plugin.js'
import type { AppConfig } from './config.js'
import { createDb, type Db } from './db/pool.js'
import { registerHealthRoute } from './routes/health.js'
import { specRoutes } from './routes/specs.js'
import { userRoutes } from './routes/users.js'

export interface BuildServerOptions {
  config: AppConfig
  db?: Db
}

export async function buildServer({ config, db: providedDb }: BuildServerOptions): Promise<FastifyInstance> {
  const db = providedDb ?? createDb(config)
  const ownsDb = providedDb === undefined

  const logger =
    config.nodeEnv === 'development'
      ? {
          level: config.logLevel,
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss' },
          },
        }
      : { level: config.logLevel }

  const app = Fastify({
    logger,
    disableRequestLogging: false,
  })

  if (ownsDb) {
    app.addHook('onClose', async () => {
      await db.pool.end()
    })
  }

  await registerHealthRoute(app)
  await app.register(authPlugin, { db, adminToken: config.adminToken })
  await app.register(userRoutes, { db })
  await app.register(specRoutes, { db })

  return app
}
