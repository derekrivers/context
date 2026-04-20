import { describe, expect, it } from 'vitest'
import {
  assertVendoredIntegrity,
  computeVendoredTypesHash,
  VENDORED_TYPES_SHA256,
} from '../src/schema-integrity.js'

describe('schema integrity', () => {
  it('the pinned SHA matches the current vendored file', () => {
    expect(computeVendoredTypesHash()).toBe(VENDORED_TYPES_SHA256)
  })

  it('assertVendoredIntegrity does not throw for a pristine vendored file', () => {
    expect(() => assertVendoredIntegrity()).not.toThrow()
  })
})
