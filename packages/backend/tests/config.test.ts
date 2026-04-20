import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const baseEnv = {
  CONTEXT_PG_PASSWORD: 'secret',
  CONTEXT_ADMIN_TOKEN: 'a'.repeat(32),
  ANTHROPIC_API_KEY: 'sk-ant-test',
}

describe('loadConfig', () => {
  it('applies defaults when only required vars are set', () => {
    const c = loadConfig({ ...baseEnv })
    expect(c.nodeEnv).toBe('development')
    expect(c.host).toBe('0.0.0.0')
    expect(c.port).toBe(8180)
    expect(c.logLevel).toBe('info')
    expect(c.pg.host).toBe('localhost')
    expect(c.pg.port).toBe(5432)
    expect(c.pg.user).toBe('context')
    expect(c.pg.database).toBe('context')
    expect(c.pg.ssl).toBe(false)
    expect(c.pg.poolMax).toBe(10)
  })

  it('throws when CONTEXT_PG_PASSWORD is missing', () => {
    expect(() => loadConfig({ CONTEXT_ADMIN_TOKEN: 'a'.repeat(32), ANTHROPIC_API_KEY: 'k' })).toThrow(
      /CONTEXT_PG_PASSWORD/,
    )
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      loadConfig({ CONTEXT_PG_PASSWORD: 'secret', CONTEXT_ADMIN_TOKEN: 'a'.repeat(32) }),
    ).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('provides sensible model defaults', () => {
    const c = loadConfig({ ...baseEnv })
    expect(c.phraseModel).toBe('claude-haiku-4-5-20251001')
    expect(c.parseModel).toBe('claude-sonnet-4-6')
    expect(c.llmTimeoutMs).toBe(30000)
    expect(c.maxTurnsPerSpec).toBe(60)
    expect(c.maxTokensPerSpec).toBe(500000)
  })

  it('coerces numeric vars from strings', () => {
    const c = loadConfig({ ...baseEnv, CONTEXT_PORT: '9090', CONTEXT_PG_POOL_MAX: '25' })
    expect(c.port).toBe(9090)
    expect(c.pg.poolMax).toBe(25)
  })

  it('parses boolean CONTEXT_PG_SSL', () => {
    expect(loadConfig({ ...baseEnv, CONTEXT_PG_SSL: 'true' }).pg.ssl).toBe(true)
    expect(loadConfig({ ...baseEnv, CONTEXT_PG_SSL: 'false' }).pg.ssl).toBe(false)
  })

  it('rejects an invalid log level', () => {
    expect(() => loadConfig({ ...baseEnv, CONTEXT_LOG_LEVEL: 'loud' })).toThrow()
  })

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ ...baseEnv, CONTEXT_PORT: '70000' })).toThrow()
  })

  it('requires CONTEXT_ADMIN_TOKEN and enforces min length', () => {
    expect(() =>
      loadConfig({ CONTEXT_PG_PASSWORD: 'secret', ANTHROPIC_API_KEY: 'k' }),
    ).toThrow(/CONTEXT_ADMIN_TOKEN/)
    expect(() =>
      loadConfig({
        CONTEXT_PG_PASSWORD: 'secret',
        CONTEXT_ADMIN_TOKEN: 'short',
        ANTHROPIC_API_KEY: 'k',
      }),
    ).toThrow(/CONTEXT_ADMIN_TOKEN/)
  })
})
