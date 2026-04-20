import { Button } from '../../ui/button.js'

export interface ContradictionCardProps {
  question: string
  oldValue: unknown
  newValue: unknown
  path: string
  onKeepOld: () => void
  onUseNew: () => void
  disabled?: boolean
}

function render(value: unknown): string {
  if (value === null || value === undefined) return '(not set)'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function ContradictionCard({
  question,
  oldValue,
  newValue,
  path,
  onKeepOld,
  onUseNew,
  disabled = false,
}: ContradictionCardProps): JSX.Element {
  return (
    <article className="rounded-md border border-amber-400 bg-amber-50/40 px-4 py-3 text-sm">
      <h3 className="text-base font-semibold text-fg">
        This conflicts with what you said earlier.
      </h3>
      <p className="mt-1 font-mono text-xs text-fg-muted">{path}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-bg p-2">
          <p className="text-xs font-medium text-fg-muted">Previous</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{render(oldValue)}</pre>
        </div>
        <div className="rounded-md border border-border bg-bg p-2">
          <p className="text-xs font-medium text-fg-muted">New answer</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{render(newValue)}</pre>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onKeepOld} disabled={disabled}>
          Keep old value
        </Button>
        <Button size="sm" onClick={onUseNew} disabled={disabled}>
          Use new value
        </Button>
      </div>
      <p className="mt-3 text-xs italic text-fg-muted">{question}</p>
    </article>
  )
}
