import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn.js'

export interface SectionAccordionProps {
  label: string
  expanded: boolean
  onToggle: () => void
  progress?: { filled: number; total: number } | undefined
  children: ReactNode
  description?: string | undefined
}

export function SectionAccordion({
  label,
  expanded,
  onToggle,
  progress,
  children,
  description,
}: SectionAccordionProps): JSX.Element {
  return (
    <section className="rounded-md border border-border bg-bg">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-fg-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold">{label}</span>
        </button>
        {progress ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              progress.filled >= progress.total && progress.total > 0
                ? 'bg-accent/20 text-accent'
                : 'bg-bg-subtle text-fg-muted',
            )}
          >
            {progress.filled} of {progress.total}
          </span>
        ) : null}
      </header>
      {expanded ? (
        <div className="p-4">
          {description ? (
            <p className="mb-2 text-xs text-fg-muted">{description}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  )
}
