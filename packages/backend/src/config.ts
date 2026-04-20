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
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CONTEXT_PHRASE_MODEL: z.string().min(1).default('claude-haiku-4-5-20251001'),
  CONTEXT_PARSE_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  CONTEXT_LLM_TIMEOUT_MS: PositiveInt.default(30000),
  CONTEXT_MAX_TURNS_PER_SPEC: PositiveInt.default(60),
  CONTEXT_MAX_TOKENS_PER_SPEC: PositiveInt.default(500000),
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
  anthropicApiKey: string
  phraseModel: string
  parseModel: string
  llmTimeoutMs: number
  maxTurnsPerSpec: number
  maxTokensPerSpec: number
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
    anthropicApiKey: v.ANTHROPIC_API_KEY,
    phraseModel: v.CONTEXT_PHRASE_MODEL,
    parseModel: v.CONTEXT_PARSE_MODEL,
    llmTimeoutMs: v.CONTEXT_LLM_TIMEOUT_MS,
    maxTurnsPerSpec: v.CONTEXT_MAX_TURNS_PER_SPEC,
    maxTokensPerSpec: v.CONTEXT_MAX_TOKENS_PER_SPEC,
  }
}
