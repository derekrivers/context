import Fastify, { type FastifyInstance } from 'fastify'
import type { AppConfig } from './config.js'
import { registerHealthRoute } from './routes/health.js'

export interface BuildServerOptions {
  config: AppConfig
}

export async function buildServer({ config }: BuildServerOptions): Promise<FastifyInstance> {
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

  await registerHealthRoute(app)

  return app
}
