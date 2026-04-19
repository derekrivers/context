import { loadConfig } from './config.js'
import { buildServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const app = await buildServer({ config })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await app.listen({ host: config.host, port: config.port })
}

main().catch((err: unknown) => {
  console.error('fatal:', err)
  process.exit(1)
})

export { buildServer } from './server.js'
export { loadConfig } from './config.js'
export type { AppConfig } from './config.js'
