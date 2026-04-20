import type { TranslationNote } from './types.js'

export class TranslationError extends Error {
  readonly missingPaths: string[]
  readonly partialNotes: TranslationNote[]

  constructor(missingPaths: string[], partialNotes: TranslationNote[]) {
    super(`Cannot translate: missing required fields: ${missingPaths.join(', ')}`)
    this.name = 'TranslationError'
    this.missingPaths = missingPaths
    this.partialNotes = partialNotes
  }
}

export class SchemaVersionError extends Error {
  readonly expected: string
  readonly actual: string

  constructor(expected: string, actual: string) {
    super(
      `@context/reddwarf-adapter: vendored types drift detected. Expected ${expected}, got ${actual}.`,
    )
    this.name = 'SchemaVersionError'
    this.expected = expected
    this.actual = actual
  }
}
