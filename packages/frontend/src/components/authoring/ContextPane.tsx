import { useMemo } from 'react'
import { computeCompleteness, type SectionKey } from '@context/spec-schema'
import {
  useMarkUnanswerable,
  useRetryField,
  useSpecDetail,
  useTurns,
  useUnresolved,
} from '../../queries/authoring.js'
import { CompletenessBlock } from './context/CompletenessBlock.js'
import {
  deriveNextAction,
  NextActionCard,
} from './context/NextActionCard.js'
import { UnresolvedList } from './context/UnresolvedList.js'
import { ActivityFeed } from './context/ActivityFeed.js'

export interface ContextPaneProps {
  specId: string
  onExport: () => void
  onJumpConversation: () => void
  onNavigateToPath: (path: string) => void
}

export function ContextPane({
  specId,
  onExport,
  onJumpConversation,
  onNavigateToPath,
}: ContextPaneProps): JSX.Element {
  const specQuery = useSpecDetail(specId)
  const turnsQuery = useTurns(specId)
  const unresolvedQuery = useUnresolved(specId)
  const retry = useRetryField(specId)
  const markUnanswerable = useMarkUnanswerable(specId)

  const spec = specQuery.data?.spec
  const turns = turnsQuery.data?.turns ?? []
  const unresolved = unresolvedQuery.data?.entries ?? []

  const report = useMemo(() => (spec ? computeCompleteness(spec) : null), [spec])

  const onNavigateSection = (key: SectionKey): void => onNavigateToPath(`${key}`)

  const scrollToUnresolved = (): void => {
    document
      .getElementById('context-unresolved-anchor')
      ?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {report ? (
        <CompletenessBlock report={report} onSectionClick={onNavigateSection} />
      ) : (
        <div className="p-4 text-xs text-fg-muted">Loading completeness…</div>
      )}
      {report ? (
        <NextActionCard
          state={deriveNextAction({
            report,
            turns,
            unresolvedCount: unresolved.length,
            turnCapReached: false,
            onReviewUnresolved: scrollToUnresolved,
            onJumpConversation,
            onExport,
          })}
        />
      ) : null}
      <div id="context-unresolved-anchor">
        <UnresolvedList
          entries={unresolved}
          onRetry={(path) => void retry.mutateAsync(path)}
          onMarkUnanswerable={(path) => {
            if (!spec) return
            void markUnanswerable.mutateAsync({ path, currentSpec: spec })
          }}
          onNavigate={onNavigateToPath}
          retryPending={retry.isPending}
          markPending={markUnanswerable.isPending}
        />
      </div>
      <ActivityFeed turns={turns} onNavigate={onNavigateToPath} />
    </div>
  )
}
