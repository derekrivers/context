import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AppConfig } from '../config.js'
import * as schema from './schema.js'

export type DatabaseClient = NodePgDatabase<typeof schema>

export interface Db {
  pool: pg.Pool
  client: DatabaseClient
}

export function createDb(config: AppConfig): Db {
  const pool = new pg.Pool({
    host: config.pg.host,
    port: config.pg.port,
    user: config.pg.user,
    password: config.pg.password,
    database: config.pg.database,
    ssl: config.pg.ssl,
    max: config.pg.poolMax,
  })
  const client = drizzle(pool, { schema })
  return { pool, client }
}
