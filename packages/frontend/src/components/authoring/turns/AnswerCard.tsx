import { cn } from '../../../lib/cn.js'

export interface AnswerCardProps {
  text: string
  confidence?: 'high' | 'medium' | 'low'
  pending?: boolean
  failed?: boolean
  onRetry?: () => void
}

export function AnswerCard({
  text,
  confidence,
  pending = false,
  failed = false,
  onRetry,
}: AnswerCardProps): JSX.Element {
  return (
    <article
      className={cn(
        'ml-auto max-w-[90%] rounded-md border px-4 py-3 text-sm',
        pending && !failed && 'border-dashed border-border bg-bg-subtle/30',
        failed && 'border-red-300 bg-red-50 text-red-900',
        !pending && !failed && 'border-border bg-accent/10',
      )}
    >
      <p className="whitespace-pre-wrap text-fg">{text}</p>
      <div className="mt-2 flex items-center justify-end gap-2">
        {confidence && confidence !== 'high' ? (
          <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-fg-muted">
            {confidence} confidence
          </span>
        ) : null}
        {pending && !failed ? (
          <span className="text-xs text-fg-muted">Saving…</span>
        ) : null}
        {failed && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    </article>
  )
}
