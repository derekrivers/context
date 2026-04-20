import { cn } from '../lib/cn.js'

export interface CompletenessBarProps {
  value: number
  className?: string
  ariaLabel?: string
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function CompletenessBar({
  value,
  className,
  ariaLabel,
}: CompletenessBarProps): JSX.Element {
  const pct = Math.round(clamp01(value) * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ariaLabel ?? 'Completeness'}
      className={cn('h-1.5 w-full rounded-full bg-bg-subtle', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${pct}%` }}
        data-testid="completeness-bar-fill"
      />
    </div>
  )
}
