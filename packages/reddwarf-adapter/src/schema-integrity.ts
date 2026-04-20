import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * SHA-256 of `reddwarf-types.ts`. Checked at module load; if the
 * vendored file changes (even a whitespace reformat) this fails
 * loudly rather than letting drift leak into translations.
 *
 * To update: re-vendor from RedDwarf, bump the SHA below to the new
 * hash, and bump ADAPTER_TARGET_* in ./version.ts to the new source
 * commit / package version.
 */
export const VENDORED_TYPES_SHA256 =
  'ebdf66b5f4681bc645892d2c84a1af7b9a357edfbc8cf3c5004d03262e10a030'

const HERE = dirname(fileURLToPath(import.meta.url))

export function computeVendoredTypesHash(): string {
  // In the compiled `dist/` layout this file sits alongside a copied
  // `reddwarf-types.js`, not the `.ts` source. We hash the TS source
  // resolved relative to the original package so both dev and prod
  // agree on the same signal.
  const candidates = [
    resolve(HERE, 'reddwarf-types.ts'),
    resolve(HERE, '..', 'src', 'reddwarf-types.ts'),
  ]
  for (const p of candidates) {
    try {
      const buf = readFileSync(p)
      return createHash('sha256').update(buf).digest('hex')
    } catch {
      continue
    }
  }
  throw new Error('vendored reddwarf-types.ts not found; cannot verify schema integrity')
}

export function assertVendoredIntegrity(): void {
  const actual = computeVendoredTypesHash()
  if (actual !== VENDORED_TYPES_SHA256) {
    throw new Error(
      `@context/reddwarf-adapter: vendored reddwarf-types.ts has drifted from its pinned SHA-256. ` +
        `Expected ${VENDORED_TYPES_SHA256}, got ${actual}. ` +
        `Either re-vendor from RedDwarf and update the pin, or revert the local change.`,
    )
  }
}
