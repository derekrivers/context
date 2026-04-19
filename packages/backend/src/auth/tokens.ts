import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_PREFIX = 'ctx_'
const TOKEN_ENTROPY_BYTES = 32

export interface GeneratedToken {
  plaintext: string
  hash: string
}

export function generateToken(): GeneratedToken {
  const raw = randomBytes(TOKEN_ENTROPY_BYTES).toString('base64url')
  const plaintext = `${TOKEN_PREFIX}${raw}`
  return { plaintext, hash: hashToken(plaintext) }
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function parseBearerToken(header: string | string[] | undefined): string | null {
  if (!header) return null
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  if (!match) return null
  const token = match[1]?.trim()
  return token && token.length > 0 ? token : null
}

export function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}
