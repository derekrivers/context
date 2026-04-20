import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, apiGet, apiPost, setOnUnauthorized } from '../src/lib/api.js'
import { clearToken, setToken } from '../src/lib/auth.js'

function mockResponse(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): Response {
  const status = init.status ?? 200
  const text = body === undefined ? '' : JSON.stringify(body)
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('api', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    window.sessionStorage.clear()
    clearToken()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('apiGet validates responses with Zod', async () => {
    globalThis.fetch = vi.fn(async () =>
      mockResponse({ hello: 'world' }),
    ) as unknown as typeof fetch
    const result = await apiGet('/ok', z.object({ hello: z.string() }))
    expect(result).toEqual({ hello: 'world' })
  })

  it('apiGet throws ApiError with schema_mismatch code when shape is wrong', async () => {
    globalThis.fetch = vi.fn(async () =>
      mockResponse({ hello: 42 }),
    ) as unknown as typeof fetch
    await expect(
      apiGet('/ok', z.object({ hello: z.string() })),
    ).rejects.toMatchObject({ code: 'schema_mismatch' })
  })

  it('apiPost includes the bearer token and body', async () => {
    setToken('ctx_test')
    const spy = vi.fn(async () =>
      mockResponse({ ok: true }),
    ) as unknown as typeof fetch
    globalThis.fetch = spy
    await apiPost('/things', { a: 1 }, z.object({ ok: z.boolean() }))
    const call = (spy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!
    const init = call[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ctx_test')
    expect(init.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('401 clears the token and triggers onUnauthorized', async () => {
    setToken('ctx_test')
    const handler = vi.fn()
    setOnUnauthorized(handler)
    globalThis.fetch = vi.fn(async () =>
      mockResponse({ error: 'unauthorized' }, { status: 401 }),
    ) as unknown as typeof fetch
    await expect(apiGet('/me', z.object({}))).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('context.token')).toBeNull()
  })

  it('surfaces non-ok responses as ApiError with server error message', async () => {
    globalThis.fetch = vi.fn(async () =>
      mockResponse({ error: 'bad thing' }, { status: 400 }),
    ) as unknown as typeof fetch
    const err = await apiGet('/x', z.object({})).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect((err as ApiError).message).toBe('bad thing')
  })
})
