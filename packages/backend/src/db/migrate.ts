import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { loadConfig } from '../config.js'
import { createDb } from './pool.js'

const thisFile = fileURLToPath(import.meta.url)
const MIGRATIONS_FOLDER = resolve(dirname(thisFile), '..', '..', 'drizzle')

async function main(): Promise<void> {
  const config = loadConfig()
  const db = createDb(config)
  try {
    await migrate(db.client, { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('migrations applied')
  } finally {
    await db.pool.end()
  }
}

main().catch((err: unknown) => {
  console.error('migration failed:', err)
  process.exitCode = 1
})
