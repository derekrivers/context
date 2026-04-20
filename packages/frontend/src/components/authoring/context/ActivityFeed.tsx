import type { TurnPhase, TurnRow } from '../../../queries/authoring.js'
import { relativeTime } from '../../../lib/time.js'
import { cn } from '../../../lib/cn.js'
import { useAuthoring } from '../../../contexts/AuthoringContexts.js'

const PHASE_LABELS: Record<TurnPhase, string> = {
  selection: 'Asked about',
  answer: 'Answered',
  clarification: 'Needed clarification on',
  skip: 'Skipped',
  unskip: 'Unskipped',
  direct_edit: 'Edited directly',
  retry_request: 'Re-queued',
}

const PHASE_DOTS: Record<TurnPhase, string> = {
  selection: 'bg-accent',
  answer: 'bg-emerald-500',
  clarification: 'bg-amber-500',
  skip: 'bg-fg-muted',
  unskip: 'bg-fg-muted',
  direct_edit: 'bg-purple-500',
  retry_request: 'bg-blue-500',
}

export interface ActivityFeedProps {
  turns: TurnRow[]
  onNavigate: (path: string) => void
}

export function ActivityFeed({ turns, onNavigate }: ActivityFeedProps): JSX.Element {
  const { activeTargetPath } = useAuthoring()
  const recent = [...turns].reverse().slice(0, 50)
  return (
    <section className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Activity</h3>
      {recent.length === 0 ? (
        <p className="text-xs italic text-fg-muted">No activity yet.</p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  if (t.target_path) onNavigate(t.target_path)
                }}
                disabled={!t.target_path}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-bg-subtle disabled:hover:bg-transparent',
                  activeTargetPath && t.target_path === activeTargetPath
                    ? 'bg-accent/10'
                    : '',
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PHASE_DOTS[t.phase])}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-fg">{PHASE_LABELS[t.phase]}</span>
                  {t.target_path ? (
                    <span className="ml-1 font-mono text-fg-muted">{t.target_path}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-fg-muted">
                  {relativeTime(t.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
