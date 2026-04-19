import { describe, expect, it } from 'vitest'
import {
  TOKEN_PREFIX,
  constantTimeEquals,
  generateToken,
  hashToken,
  parseBearerToken,
} from '../src/auth/tokens.js'

describe('generateToken', () => {
  it('returns a prefixed plaintext token and matching hash', () => {
    const t = generateToken()
    expect(t.plaintext.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(t.plaintext.length).toBeGreaterThan(TOKEN_PREFIX.length + 32)
    expect(t.hash).toBe(hashToken(t.plaintext))
  })

  it('produces unique tokens across calls', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).not.toBe(b.hash)
  })

  it('never stores plaintext equal to its hash', () => {
    const t = generateToken()
    expect(t.plaintext).not.toBe(t.hash)
  })
})

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('ctx_abc')).toBe(hashToken('ctx_abc'))
  })

  it('differs for different inputs', () => {
    expect(hashToken('ctx_abc')).not.toBe(hashToken('ctx_abd'))
  })

  it('returns a 64-char hex string (sha256)', () => {
    expect(hashToken('anything')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('parseBearerToken', () => {
  it('returns null for missing header', () => {
    expect(parseBearerToken(undefined)).toBeNull()
  })

  it('returns null for non-Bearer scheme', () => {
    expect(parseBearerToken('Basic abc')).toBeNull()
  })

  it('extracts token from a valid Bearer header', () => {
    expect(parseBearerToken('Bearer ctx_xyz')).toBe('ctx_xyz')
  })

  it('handles case-insensitive scheme and extra whitespace', () => {
    expect(parseBearerToken('bearer   ctx_xyz  ')).toBe('ctx_xyz')
  })

  it('returns null for empty token', () => {
    expect(parseBearerToken('Bearer ')).toBeNull()
  })

  it('returns null for empty array or empty string values', () => {
    expect(parseBearerToken([])).toBeNull()
    expect(parseBearerToken('')).toBeNull()
  })
})

describe('constantTimeEquals', () => {
  it('matches equal strings', () => {
    expect(constantTimeEquals('ctx_abc123', 'ctx_abc123')).toBe(true)
  })

  it('rejects different strings of the same length', () => {
    expect(constantTimeEquals('ctx_abc', 'ctx_abd')).toBe(false)
  })

  it('rejects strings of different lengths without throwing', () => {
    expect(constantTimeEquals('short', 'longer-string')).toBe(false)
  })
})
