import { z } from 'zod'
import { clearToken, getToken } from './auth.js'

const BACKEND_URL = import.meta.env.VITE_CONTEXT_BACKEND_URL ?? '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly body: unknown

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    if (code !== undefined) this.code = code
    this.body = body
  }
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler = () => {
  if (typeof window !== 'undefined') window.location.assign('/login')
}

export function setOnUnauthorized(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

interface RequestOptions {
  method: string
  body?: unknown
}

async function request<T>(
  path: string,
  opts: RequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  const url = `${BACKEND_URL}${path}`
  const init: RequestInit = { method: opts.method, headers }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)
  const response = await fetch(url, init)

  if (response.status === 401) {
    clearToken()
    onUnauthorized()
    throw new ApiError(401, 'unauthorized')
  }

  if (response.status === 204) {
    return schema.parse(undefined as unknown)
  }

  let parsedBody: unknown = null
  const text = await response.text()
  if (text.length > 0) {
    try {
      parsedBody = JSON.parse(text) as unknown
    } catch {
      parsedBody = text
    }
  }

  if (!response.ok) {
    const message =
      (parsedBody &&
        typeof parsedBody === 'object' &&
        'error' in (parsedBody as Record<string, unknown>) &&
        typeof (parsedBody as { error?: unknown }).error === 'string'
        ? (parsedBody as { error: string }).error
        : response.statusText) || 'request failed'
    const code =
      parsedBody &&
      typeof parsedBody === 'object' &&
      'code' in (parsedBody as Record<string, unknown>) &&
      typeof (parsedBody as { code?: unknown }).code === 'string'
        ? (parsedBody as { code: string }).code
        : undefined
    throw new ApiError(response.status, message, code, parsedBody)
  }

  const parsed = schema.safeParse(parsedBody)
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      `unexpected response shape: ${parsed.error.message}`,
      'schema_mismatch',
      parsedBody,
    )
  }
  return parsed.data
}

export function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return request(path, { method: 'GET' }, schema)
}

export function apiPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return request(path, { method: 'POST', body }, schema)
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return request(path, { method: 'PATCH', body }, schema)
}

export function apiDelete<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return request(path, { method: 'DELETE' }, schema)
}
