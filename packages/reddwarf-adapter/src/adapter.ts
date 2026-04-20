import type { CanonicalSpec } from '@context/spec-schema'
import { projectSpecSchema, type ProjectSize, type ProjectSpec, type ProjectStatus } from './reddwarf-types.js'
import { TranslationError } from './errors.js'
import { assertVendoredIntegrity } from './schema-integrity.js'
import { ADAPTER_VERSION, targetSchemaVersion } from './version.js'
import type { AdapterResult, TranslationNote } from './types.js'
import { compareNotes, note, type SummaryBlock } from './rules/common.js'
import { translateIntent } from './rules/intent.js'
import { translateDomainModel } from './rules/domain_model.js'
import { translateCapabilities } from './rules/capabilities.js'
import { translateFlows } from './rules/flows.js'
import { translateConstraints } from './rules/constraints.js'
import { translateReferences } from './rules/references.js'
import { readExtensionOverrides } from './rules/extensions.js'

// Verify the vendored types file hasn't drifted since we last pinned.
assertVendoredIntegrity()

export const SUMMARY_MAX_CHARS = 8000
const SUMMARY_TRUNCATION_SUFFIX = '\n\n_…truncated to fit RedDwarf summary cap._'

function inferProjectSize(capabilityCount: number): ProjectSize {
  if (capabilityCount <= 3) return 'small'
  if (capabilityCount <= 10) return 'medium'
  return 'large'
}

function deriveContextVersion(spec: CanonicalSpec): number {
  const anyVersion = (spec as { version?: unknown }).version
  if (typeof anyVersion === 'number' && Number.isFinite(anyVersion)) return anyVersion
  return 1
}

function assembleSummary(
  blocks: SummaryBlock[],
  notes: TranslationNote[],
): string {
  // Sort deterministic: keepPriority desc so highest-priority blocks come first.
  const sorted = [...blocks].sort((a, b) => b.keepPriority - a.keepPriority)
  const rendered: Array<{ block: SummaryBlock; text: string }> = sorted.map((b) => ({
    block: b,
    text: `${b.heading}\n\n${b.body}`,
  }))
  let joined = rendered.map((r) => r.text).join('\n\n')
  if (joined.length <= SUMMARY_MAX_CHARS) return joined

  // Truncate from the lowest-priority block first (last in `sorted`).
  const remaining = [...rendered]
  while (joined.length > SUMMARY_MAX_CHARS && remaining.length > 1) {
    const dropped = remaining.pop()!
    notes.push(
      note(
        'dropped',
        dropped.block.canonicalPath,
        'summary',
        `Dropped from summary to stay under ${SUMMARY_MAX_CHARS}-character cap.`,
        'warning',
      ),
    )
    joined = remaining.map((r) => r.text).join('\n\n') + SUMMARY_TRUNCATION_SUFFIX
  }

  if (joined.length > SUMMARY_MAX_CHARS) {
    const keep = remaining[0]!
    const suffix = SUMMARY_TRUNCATION_SUFFIX
    const budget = SUMMARY_MAX_CHARS - suffix.length
    const truncated = keep.text.slice(0, budget)
    notes.push(
      note(
        'coerced',
        keep.block.canonicalPath,
        'summary',
        `Truncated block body to fit ${SUMMARY_MAX_CHARS}-character summary cap.`,
        'warning',
      ),
    )
    joined = truncated + suffix
  }
  return joined
}

function ensureSummaryMinLength(summary: string): string {
  if (summary.length >= 20) return summary
  return summary + '\n\n(no additional context provided)'
}

export function toProjectSpec(canonicalSpec: CanonicalSpec): AdapterResult {
  const collectedNotes: TranslationNote[] = []
  const missing: string[] = []

  const intent = translateIntent(canonicalSpec)
  collectedNotes.push(...intent.notes)
  if (!intent.title) missing.push('intent.summary')

  const domain = translateDomainModel(canonicalSpec)
  collectedNotes.push(...domain.notes)

  const capabilities = translateCapabilities(canonicalSpec)
  collectedNotes.push(...capabilities.notes)

  const flows = translateFlows(canonicalSpec)
  collectedNotes.push(...flows.notes)

  const constraints = translateConstraints(canonicalSpec)
  collectedNotes.push(...constraints.notes)

  const references = translateReferences(canonicalSpec)
  collectedNotes.push(...references.notes)

  const extensions = readExtensionOverrides(canonicalSpec)
  collectedNotes.push(...extensions.notes)

  // sourceRepo must come from the extension; otherwise we can't inject.
  const sourceRepo = (extensions.overrides.sourceRepo as string | undefined) ?? null
  if (!sourceRepo || sourceRepo.length === 0) {
    missing.push("extensions['reddwarf:project_spec'].sourceRepo")
  }

  if (missing.length > 0) {
    throw new TranslationError(missing, collectedNotes.sort(compareNotes))
  }

  const summaryBlocks: SummaryBlock[] = [
    intent.problemBlock,
    intent.usersBlock,
    intent.nonGoalsBlock,
    domain.block,
    capabilities.block,
    flows.block,
    constraints.block,
    references.block,
  ].filter((b): b is SummaryBlock => b !== null)

  const summaryBody = assembleSummary(summaryBlocks, collectedNotes)
  const summary = ensureSummaryMinLength(summaryBody)

  const projectSize: ProjectSize =
    (extensions.overrides.projectSize as ProjectSize | undefined) ??
    inferProjectSize(capabilities.capabilityCount)

  if (extensions.overrides.projectSize === undefined) {
    collectedNotes.push(
      note(
        'inferred',
        'capabilities',
        'projectSize',
        `Inferred ProjectSpec.projectSize=${projectSize} from ${capabilities.capabilityCount} capabilit${capabilities.capabilityCount === 1 ? 'y' : 'ies'}.`,
      ),
    )
  }

  const status: ProjectStatus =
    (extensions.overrides.status as ProjectStatus | undefined) ?? 'pending_approval'

  const nowIso = canonicalSpec.updated_at

  const candidate = {
    projectId:
      (extensions.overrides.projectId as string | undefined) ?? canonicalSpec.id,
    sourceIssueId: (extensions.overrides.sourceIssueId as string | null | undefined) ?? null,
    sourceRepo: sourceRepo!,
    title:
      (extensions.overrides.title as string | undefined) ??
      (intent.title ?? 'Untitled spec'),
    summary: (extensions.overrides.summary as string | undefined) ?? summary,
    projectSize,
    status,
    complexityClassification:
      (extensions.overrides.complexityClassification as ProjectSpec['complexityClassification'] | undefined) ??
      null,
    approvalDecision:
      (extensions.overrides.approvalDecision as string | null | undefined) ?? null,
    decidedBy: (extensions.overrides.decidedBy as string | null | undefined) ?? null,
    decisionSummary:
      (extensions.overrides.decisionSummary as string | null | undefined) ?? null,
    amendments: (extensions.overrides.amendments as string | null | undefined) ?? null,
    clarificationQuestions:
      (extensions.overrides.clarificationQuestions as string[] | null | undefined) ?? null,
    clarificationAnswers:
      (extensions.overrides.clarificationAnswers as Record<string, string> | null | undefined) ??
      null,
    clarificationRequestedAt:
      (extensions.overrides.clarificationRequestedAt as string | null | undefined) ?? null,
    createdAt: (extensions.overrides.createdAt as string | undefined) ?? canonicalSpec.created_at,
    updatedAt: (extensions.overrides.updatedAt as string | undefined) ?? nowIso,
  }

  // Silent information loss guard: the adapter's output must pass RedDwarf's Zod.
  const parsed = projectSpecSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new Error(
      `@context/reddwarf-adapter produced a ProjectSpec that failed validation against the vendored schema. ` +
        `This is an adapter bug. Issues: ${JSON.stringify(parsed.error.issues)}`,
    )
  }

  collectedNotes.sort(compareNotes)

  return {
    projectSpec: parsed.data,
    translationNotes: collectedNotes,
    contextSpecId: canonicalSpec.id,
    contextVersion: deriveContextVersion(canonicalSpec),
    adapterVersion: ADAPTER_VERSION,
    targetSchemaVersion: targetSchemaVersion(),
  }
}
