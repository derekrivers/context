export type PathToken = string | number

export function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = []
  const matches = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? []
  for (const raw of matches) {
    const idxMatch = /^\[(\d+)\]$/.exec(raw)
    if (idxMatch && idxMatch[1] !== undefined) {
      tokens.push(Number.parseInt(idxMatch[1], 10))
    } else {
      tokens.push(raw)
    }
  }
  return tokens
}

export function getAtPath(root: unknown, path: string): unknown {
  const tokens = parsePath(path)
  let current: unknown = root
  for (const token of tokens) {
    if (current == null) return undefined
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[token]
    } else {
      if (typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[token]
    }
  }
  return current
}

export function setAtPath<T>(root: T, path: string, value: unknown): T {
  const tokens = parsePath(path)
  if (tokens.length === 0) return root
  const cloned = structuredClone(root) as unknown
  let cursor: unknown = cloned
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!
    const nextToken = tokens[i + 1]!
    const wantArray = typeof nextToken === 'number'
    if (typeof token === 'number') {
      const arr = cursor as unknown[]
      if (arr[token] === undefined) arr[token] = wantArray ? [] : {}
      cursor = arr[token]
    } else {
      const obj = cursor as Record<string, unknown>
      if (obj[token] === undefined) obj[token] = wantArray ? [] : {}
      cursor = obj[token]
    }
  }
  const last = tokens[tokens.length - 1]!
  if (typeof last === 'number') {
    ;(cursor as unknown[])[last] = value
  } else {
    ;(cursor as Record<string, unknown>)[last] = value
  }
  return cloned as T
}

export function removeAtPath<T>(root: T, path: string): T {
  const tokens = parsePath(path)
  if (tokens.length === 0) return root
  const cloned = structuredClone(root) as unknown
  let cursor: unknown = cloned
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!
    if (typeof token === 'number') {
      cursor = (cursor as unknown[])[token]
    } else {
      cursor = (cursor as Record<string, unknown>)[token]
    }
    if (cursor == null) return cloned as T
  }
  const last = tokens[tokens.length - 1]!
  if (typeof last === 'number') {
    const arr = cursor as unknown[]
    arr.splice(last, 1)
  } else {
    delete (cursor as Record<string, unknown>)[last]
  }
  return cloned as T
}
