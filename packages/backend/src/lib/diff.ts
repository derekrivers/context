export interface DiffEntry {
  path: string
  before: unknown
  after: unknown
}

export interface SpecDiff {
  changes: DiffEntry[]
}

export function computeDiff(before: unknown, after: unknown): SpecDiff {
  const changes: DiffEntry[] = []
  walk(before, after, '', changes)
  return { changes }
}

function walk(a: unknown, b: unknown, path: string, acc: DiffEntry[]): void {
  if (deepEqual(a, b)) return
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k
      walk(a[k], b[k], childPath, acc)
    }
    return
  }
  acc.push({ path: path || '$', before: a, after: b })
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  if (Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
      if (!Object.hasOwn(b, k)) return false
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}
