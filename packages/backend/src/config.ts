import { z } from 'zod'

const BoolString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const PortString = z.coerce.number().int().min(1).max(65535)
const PositiveInt = z.coerce.number().int().positive()

const ConfigSchema = z.object({
  CONTEXT_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CONTEXT_HOST: z.string().default('0.0.0.0'),
  CONTEXT_PORT: PortString.default(8180),
  CONTEXT_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CONTEXT_PG_HOST: z.string().default('localhost'),
  CONTEXT_PG_PORT: PortString.default(5432),
  CONTEXT_PG_USER: z.string().default('context'),
  CONTEXT_PG_PASSWORD: z.string().min(1, 'CONTEXT_PG_PASSWORD is required'),
  CONTEXT_PG_DATABASE: z.string().default('context'),
  CONTEXT_PG_SSL: BoolString.default('false'),
  CONTEXT_PG_POOL_MAX: PositiveInt.default(10),
  CONTEXT_ADMIN_TOKEN: z
    .string()
    .min(16, 'CONTEXT_ADMIN_TOKEN must be at least 16 characters'),
})

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test'
  host: string
  port: number
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  pg: {
    host: string
    port: number
    user: string
    password: string
    database: string
    ssl: boolean
    poolMax: number
  }
  adminToken: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  const v = parsed.data
  return {
    nodeEnv: v.CONTEXT_NODE_ENV,
    host: v.CONTEXT_HOST,
    port: v.CONTEXT_PORT,
    logLevel: v.CONTEXT_LOG_LEVEL,
    pg: {
      host: v.CONTEXT_PG_HOST,
      port: v.CONTEXT_PG_PORT,
      user: v.CONTEXT_PG_USER,
      password: v.CONTEXT_PG_PASSWORD,
      database: v.CONTEXT_PG_DATABASE,
      ssl: v.CONTEXT_PG_SSL,
      poolMax: v.CONTEXT_PG_POOL_MAX,
    },
    adminToken: v.CONTEXT_ADMIN_TOKEN,
  }
}
