import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CanonicalSpecSchema, type CanonicalSpec } from '@context/spec-schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export function loadFixture(name: string): CanonicalSpec {
  const path = resolve(HERE, '..', 'fixtures', name)
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return CanonicalSpecSchema.parse(raw)
}

export function loadRawFixture(name: string): unknown {
  const path = resolve(HERE, '..', 'fixtures', name)
  return JSON.parse(readFileSync(path, 'utf8'))
}
