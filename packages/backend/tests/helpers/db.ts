import pg from 'pg'
import { createDb, type Db } from '../../src/db/pool.js'
import type { AppConfig } from '../../src/config.js'

export function integrationConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    host: '0.0.0.0',
    port: 0,
    logLevel: 'silent',
    pg: {
      host: process.env['CONTEXT_PG_HOST'] ?? 'localhost',
      port: Number(process.env['CONTEXT_PG_PORT'] ?? 5432),
      user: process.env['CONTEXT_PG_USER'] ?? 'context',
      password: process.env['CONTEXT_PG_PASSWORD'] ?? 'context',
      database: process.env['CONTEXT_PG_DATABASE'] ?? 'context',
      ssl: false,
      poolMax: 5,
    },
    adminToken: 'test-admin-token-0123456789',
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? 'test-anthropic-key',
    phraseModel: 'claude-haiku-4-5-20251001',
    parseModel: 'claude-sonnet-4-6',
    llmTimeoutMs: 30000,
    maxTurnsPerSpec: 60,
    maxTokensPerSpec: 500000,
  }
}

export async function probePostgres(config: AppConfig): Promise<boolean> {
  const pool = new pg.Pool({
    host: config.pg.host,
    port: config.pg.port,
    user: config.pg.user,
    password: config.pg.password,
    database: config.pg.database,
    ssl: config.pg.ssl,
    max: 1,
    connectionTimeoutMillis: 800,
  })
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function resetTables(db: Db): Promise<void> {
  await db.pool.query(
    'TRUNCATE context.conversation_turns, context.spec_history, context.spec_shares, context.specs, context.users RESTART IDENTITY CASCADE',
  )
}

export function createTestDb(config: AppConfig): Db {
  return createDb(config)
}
