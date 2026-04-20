import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.js'
import type { AppConfig } from '../src/config.js'

function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    host: '0.0.0.0',
    port: 0,
    logLevel: 'silent',
    pg: {
      host: 'localhost',
      port: 5432,
      user: 'context',
      password: 'context',
      database: 'context',
      ssl: false,
      poolMax: 10,
    },
    adminToken: 'test-admin-token-0123456789',
    anthropicApiKey: 'test-anthropic-key',
    phraseModel: 'claude-haiku-4-5-20251001',
    parseModel: 'claude-sonnet-4-6',
    llmTimeoutMs: 30000,
    maxTurnsPerSpec: 60,
    maxTokensPerSpec: 500000,
  }
}

describe('GET /health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer({ config: testConfig() })
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns { status: ok } with 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('requires no auth header', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: {} })
    expect(res.statusCode).toBe(200)
  })
})
