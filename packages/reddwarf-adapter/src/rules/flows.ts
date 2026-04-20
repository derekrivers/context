import type { CanonicalSpec } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { note, type SummaryBlock } from './common.js'

export interface FlowsResult {
  block: SummaryBlock | null
  notes: TranslationNote[]
}

export function translateFlows(spec: CanonicalSpec): FlowsResult {
  const flows = spec.flows
  const notes: TranslationNote[] = []
  if (flows.length === 0) return { block: null, notes }

  const lines: string[] = []
  flows.forEach((flow, i) => {
    lines.push(`- flow: ${flow.id}`)
    lines.push(`  name: ${flow.name}`)
    lines.push(`  trigger: ${oneLine(flow.trigger)}`)
    if (flow.steps.length > 0) {
      lines.push('  steps:')
      for (const step of flow.steps) {
        lines.push(`    - actor: ${step.actor}`)
        lines.push(`      action: ${oneLine(step.action)}`)
      }
    }
    if (flow.failure_modes.length > 0) {
      lines.push('  failure_modes:')
      for (const fm of flow.failure_modes) {
        lines.push(`    - when: ${oneLine(fm.when)}`)
        lines.push(`      behavior: ${oneLine(fm.behavior)}`)
      }
    }
    notes.push(
      note(
        'grouped',
        `flows[${i}]`,
        'summary',
        `Flow "${flow.name}" folded into summary block "## Flows". RedDwarf's Architect will re-attach steps to tickets after approval.`,
      ),
    )
  })

  return {
    block: {
      heading: '## Flows',
      body: lines.join('\n'),
      keepPriority: 70,
      canonicalPath: 'flows',
    },
    notes,
  }
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
