import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearToken, getToken, hasToken, setToken } from '../src/lib/auth.js'

describe('auth', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('round-trips set → get', () => {
    setToken('ctx_abc')
    expect(getToken()).toBe('ctx_abc')
    expect(hasToken()).toBe(true)
  })

  it('clears to null', () => {
    setToken('ctx_abc')
    clearToken()
    expect(getToken()).toBeNull()
    expect(hasToken()).toBe(false)
  })

  it('returns null when nothing is stored', () => {
    expect(getToken()).toBeNull()
    expect(hasToken()).toBe(false)
  })
})
