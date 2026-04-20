import type { CanonicalSpec } from '@context/spec-schema'

export interface DependencyRule {
  match: (path: string) => boolean
  satisfied: (spec: CanonicalSpec, path: string) => boolean
  reason: string
}

function capabilityIndex(path: string): number | null {
  const m = /^capabilities\[(\d+)\]/.exec(path)
  return m && m[1] !== undefined ? Number.parseInt(m[1], 10) : null
}

function flowIndex(path: string): number | null {
  const m = /^flows\[(\d+)\]/.exec(path)
  return m && m[1] !== undefined ? Number.parseInt(m[1], 10) : null
}

export const DEPENDENCY_RULES: readonly DependencyRule[] = [
  {
    match: (p) => p === 'capabilities' || /^capabilities\[\d+\]$/.test(p),
    satisfied: (s) => s.domain_model.entities.length >= 1,
    reason: 'capabilities require at least one entity in domain_model.entities',
  },
  {
    match: (p) => /^capabilities\[\d+\]\.acceptance_criteria$/.test(p),
    satisfied: (s, path) => {
      const i = capabilityIndex(path)
      if (i === null) return true
      const cap = s.capabilities[i]
      return !!cap && !!cap.name && !!cap.verb
    },
    reason: 'acceptance_criteria require the capability to have a name and verb',
  },
  {
    match: (p) => p === 'flows' || /^flows\[\d+\]$/.test(p),
    satisfied: (s) => s.capabilities.some((c) => !!c.name),
    reason: 'flows require at least one named capability',
  },
  {
    match: (p) => /^flows\[\d+\]\.steps$/.test(p),
    satisfied: (s, path) => {
      const i = flowIndex(path)
      if (i === null) return true
      const flow = s.flows[i]
      return !!flow && !!flow.trigger && flow.trigger.length > 0
    },
    reason: 'flow steps require the flow to have a trigger',
  },
  {
    match: (p) => p === 'domain_model.relationships',
    satisfied: (s) => s.domain_model.entities.length >= 2,
    reason: 'relationships require at least two entities',
  },
]

export function isDependencySatisfied(spec: CanonicalSpec, path: string): boolean {
  for (const rule of DEPENDENCY_RULES) {
    if (rule.match(path) && !rule.satisfied(spec, path)) return false
  }
  return true
}
