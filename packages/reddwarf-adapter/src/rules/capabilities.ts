import type { CanonicalSpec } from '@context/spec-schema'
import type { TranslationNote } from '../types.js'
import { note, type SummaryBlock } from './common.js'

export interface CapabilitiesResult {
  block: SummaryBlock | null
  capabilityCount: number
  notes: TranslationNote[]
}

/**
 * Capabilities render as a machine-parseable block inside
 * `ProjectSpec.summary`. RedDwarf's Architect re-plans TicketSpecs
 * from this summary after approval, so the format is deliberately
 * consistent — keys-and-colons that any downstream parser can lift
 * without fuzzy matching.
 *
 *   ## Capabilities
 *   - capability: <id>
 *     verb: <verb>
 *     name: <name>
 *     entity_ref: <entity id>
 *     description: <free text, single line>
 *     acceptance_criteria:
 *       - given: <…>
 *         when: <…>
 *         then: <…>
 */
export function translateCapabilities(spec: CanonicalSpec): CapabilitiesResult {
  const notes: TranslationNote[] = []
  const caps = spec.capabilities
  if (caps.length === 0) {
    return { block: null, capabilityCount: 0, notes }
  }

  const lines: string[] = []
  for (const cap of caps) {
    lines.push(`- capability: ${cap.id}`)
    lines.push(`  verb: ${cap.verb}`)
    lines.push(`  name: ${cap.name}`)
    lines.push(`  entity_ref: ${cap.entity_ref}`)
    if (cap.description) {
      lines.push(`  description: ${flattenLine(cap.description)}`)
    }
    if (cap.acceptance_criteria.length > 0) {
      lines.push('  acceptance_criteria:')
      for (const ac of cap.acceptance_criteria) {
        lines.push(`    - given: ${flattenLine(ac.given)}`)
        lines.push(`      when: ${flattenLine(ac.when)}`)
        lines.push(`      then: ${flattenLine(ac.then)}`)
      }
    }
    notes.push(
      note(
        'grouped',
        `capabilities[${caps.indexOf(cap)}]`,
        'summary',
        `Capability "${cap.name}" folded into summary block "## Capabilities". RedDwarf's Architect will regenerate TicketSpecs from this block after approval.`,
      ),
    )
  }

  return {
    block: {
      heading: '## Capabilities',
      body: lines.join('\n'),
      keepPriority: 100,
      canonicalPath: 'capabilities',
    },
    capabilityCount: caps.length,
    notes,
  }
}

function flattenLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
