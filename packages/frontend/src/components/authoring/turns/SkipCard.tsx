import { cn } from '../../../lib/cn.js'

export interface SkipCardProps {
  path: string
  onUnskip?: () => void
  disabled?: boolean
}

export function SkipCard({ path, onUnskip, disabled = false }: SkipCardProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border border-dashed border-border px-4 py-2 text-xs text-fg-muted',
      )}
    >
      <span>
        Skipped <span className="font-mono">{path}</span> for now.
      </span>
      {onUnskip ? (
        <button
          type="button"
          onClick={onUnskip}
          disabled={disabled}
          className="underline disabled:opacity-50"
        >
          Unskip
        </button>
      ) : null}
    </div>
  )
}
