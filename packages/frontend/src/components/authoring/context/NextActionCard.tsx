import type { CompletenessReport, SectionKey } from '@context/spec-schema'
import type { TurnRow } from '../../../queries/authoring.js'

export type NextActionState =
  | { kind: 'turn_cap'; onReview: () => void }
  | { kind: 'unresolved'; count: number; onReview: () => void }
  | { kind: 'complete'; onExport: () => void }
  | { kind: 'active_selection'; onJump: () => void }
  | { kind: 'continue'; onJump: () => void }

const THRESHOLDS: Record<SectionKey, number> = {
  intent: 0.95,
  domain_model: 0.8,
  capabilities: 0.8,
  flows: 0.6,
  constraints: 0.6,
  references: 0.2,
}

function allThresholdsMet(report: CompletenessReport): boolean {
  return (Object.keys(THRESHOLDS) as SectionKey[]).every(
    (k) => report.bySection[k].score >= THRESHOLDS[k],
  )
}

export function deriveNextAction(args: {
  report: CompletenessReport
  turns: TurnRow[]
  unresolvedCount: number
  turnCapReached: boolean
  onReviewUnresolved: () => void
  onJumpConversation: () => void
  onExport: () => void
}): NextActionState {
  if (args.turnCapReached) return { kind: 'turn_cap', onReview: args.onReviewUnresolved }
  const belowThreshold = !allThresholdsMet(args.report)
  if (args.unresolvedCount > 0 && belowThreshold) {
    return {
      kind: 'unresolved',
      count: args.unresolvedCount,
      onReview: args.onReviewUnresolved,
    }
  }
  if (!belowThreshold) return { kind: 'complete', onExport: args.onExport }
  let latest: TurnRow | undefined
  for (let i = args.turns.length - 1; i >= 0; i--) {
    const t = args.turns[i]!
    if (t.phase === 'selection') {
      latest = t
      break
    }
  }
  if (latest && latest.outcome === null) {
    return { kind: 'active_selection', onJump: args.onJumpConversation }
  }
  return { kind: 'continue', onJump: args.onJumpConversation }
}

export function NextActionCard({ state }: { state: NextActionState }): JSX.Element {
  let title = ''
  let body = ''
  let buttonLabel = ''
  let onClick: () => void = () => undefined

  switch (state.kind) {
    case 'turn_cap':
      title = 'Turn cap reached'
      body = "We've hit the conversation limit. Review the spec and address unresolved questions below."
      buttonLabel = 'Review unresolved'
      onClick = state.onReview
      break
    case 'unresolved':
      title = `${state.count} unresolved ${state.count === 1 ? 'question' : 'questions'}`
      body = 'Resolving them will help the spec progress.'
      buttonLabel = 'Review unresolved'
      onClick = state.onReview
      break
    case 'complete':
      title = 'Spec looks complete'
      body = 'Review, then export or send.'
      buttonLabel = 'Export JSON'
      onClick = state.onExport
      break
    case 'active_selection':
      title = 'Answer the current question'
      body = ''
      buttonLabel = 'Jump to conversation'
      onClick = state.onJump
      break
    case 'continue':
      title = 'Keep going'
      body = 'Continue the conversation to keep building the spec.'
      buttonLabel = 'Jump to conversation'
      onClick = state.onJump
      break
  }

  return (
    <section className="border-b border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {body ? <p className="mt-1 text-xs text-fg-muted">{body}</p> : null}
      <button
        type="button"
        onClick={onClick}
        className="mt-2 text-xs font-medium text-accent underline"
      >
        {buttonLabel} →
      </button>
    </section>
  )
}
