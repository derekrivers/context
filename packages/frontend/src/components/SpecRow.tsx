import { Link } from '@tanstack/react-router'
import type { SpecSummary } from '../queries/specs.js'
import { CompletenessBar } from './CompletenessBar.js'
import { StatusChip } from './StatusChip.js'
import { relativeTime } from '../lib/time.js'
import { cn } from '../lib/cn.js'

export interface SpecRowProps {
  spec: SpecSummary
  ownerDisplay: string
  isOwner: boolean
  now?: () => Date
}

const ACCESS_LABELS: Record<'editor' | 'viewer', string> = {
  editor: 'editor',
  viewer: 'viewer',
}

export function SpecRow({
  spec,
  ownerDisplay,
  isOwner,
  now,
}: SpecRowProps): JSX.Element {
  const title = spec.title && spec.title.length > 0 ? spec.title : 'Untitled spec'
  const ownerText = isOwner ? 'You' : ownerDisplay
  const nowFn = now ?? (() => new Date())
  return (
    <Link
      to="/specs/$id"
      params={{ id: spec.id }}
      className={cn(
        'flex w-full flex-col gap-2 rounded-md border border-border bg-bg px-4 py-3 text-left transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
          <StatusChip status={spec.status} />
          {!isOwner ? (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
              {ACCESS_LABELS[spec.access === 'viewer' ? 'viewer' : 'editor']}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-fg-muted" title={spec.updated_at}>
          {relativeTime(spec.updated_at, nowFn())}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <CompletenessBar
          value={spec.completeness.overall}
          className="flex-1"
          ariaLabel={`Completeness for ${title}`}
        />
        <span className="shrink-0 text-xs text-fg-muted">{ownerText}</span>
      </div>
    </Link>
  )
}
