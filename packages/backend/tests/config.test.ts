import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const baseEnv = {
  CONTEXT_PG_PASSWORD: 'secret',
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
    expect(() => loadConfig({})).toThrow(/CONTEXT_PG_PASSWORD/)
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
})
