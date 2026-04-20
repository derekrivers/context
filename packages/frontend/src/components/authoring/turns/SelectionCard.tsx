import { cn } from '../../../lib/cn.js'

export interface SelectionCardProps {
  question: string | null
  targetPath: string
  section: string
  isPhrasing?: boolean
}

export function SelectionCard({
  question,
  targetPath,
  section,
  isPhrasing = false,
}: SelectionCardProps): JSX.Element {
  return (
    <article
      className={cn(
        'rounded-md border border-border bg-bg-subtle/40 px-4 py-3 text-sm',
        isPhrasing && 'animate-pulse',
      )}
    >
      <p className="text-fg">
        {question ?? (isPhrasing ? 'Thinking of the next question…' : '…')}
      </p>
      <p className="mt-2 font-mono text-xs italic text-fg-muted">
        About: {section}.{targetPath}
      </p>
    </article>
  )
}
