import { randomUUID } from 'node:crypto'
import { SCHEMA_VERSION, type CanonicalSpec, type Author } from './schema.js'

export interface CreateEmptySpecInput {
  title: string
  author: Author
  now?: () => Date
  id?: string
}

export function createEmptySpec(input: CreateEmptySpecInput): CanonicalSpec {
  const nowFn = input.now ?? (() => new Date())
  const timestamp = nowFn().toISOString()
  const id = input.id ?? randomUUID()

  return {
    schema_version: SCHEMA_VERSION,
    id,
    title: input.title,
    status: 'draft',
    created_at: timestamp,
    updated_at: timestamp,
    intent: {},
    domain_model: {
      entities: [],
      relationships: [],
    },
    capabilities: [],
    flows: [],
    constraints: {},
    references: [],
    provenance: {
      authors: [input.author],
      unresolved_questions: [],
    },
    extensions: {},
  }
}
