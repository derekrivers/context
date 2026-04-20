import type { UnresolvedEntry } from '../../../queries/authoring.js'
import { useAuthoringReadOnly } from '../../../contexts/AuthoringContexts.js'
import { relativeTime } from '../../../lib/time.js'
import { Button } from '../../ui/button.js'

export interface UnresolvedListProps {
  entries: UnresolvedEntry[]
  onRetry: (path: string) => void
  onMarkUnanswerable: (path: string) => void
  onNavigate: (path: string) => void
  retryPending: boolean
  markPending: boolean
}

export function UnresolvedList({
  entries,
  onRetry,
  onMarkUnanswerable,
  onNavigate,
  retryPending,
  markPending,
}: UnresolvedListProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  return (
    <section className="border-b border-border p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Unresolved{entries.length > 0 ? ` (${entries.length})` : ''}
        </h3>
      </header>
      {entries.length === 0 ? (
        <p className="text-xs italic text-fg-muted">Nothing unresolved.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.path}
              className="rounded-md border border-border bg-bg-subtle/30 p-3"
            >
              <button
                type="button"
                className="font-mono text-xs text-fg underline"
                onClick={() => onNavigate(e.path)}
              >
                {e.path}
              </button>
              {e.last_question ? (
                <p className="mt-1 text-xs text-fg-muted">{e.last_question}</p>
              ) : e.section ? (
                <p className="mt-1 text-xs text-fg-muted">Section: {e.section}</p>
              ) : null}
              <p className="mt-1 text-xs text-fg-muted">
                {e.reason === 'retry_budget_exhausted'
                  ? "Couldn't parse after 3 tries"
                  : "Marked as won't answer"}
                {' · '}
                {relativeTime(e.last_asked_at)}
              </p>
              {!readOnly ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryPending}
                    onClick={() => onRetry(e.path)}
                  >
                    Try again
                  </Button>
                  {e.reason !== 'user_marked_unanswerable' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markPending}
                      onClick={() => onMarkUnanswerable(e.path)}
                    >
                      Mark answered as unknown
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
