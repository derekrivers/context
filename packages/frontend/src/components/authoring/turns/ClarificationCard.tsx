export interface ClarificationCardProps {
  question: string
  reason: string
}

export function ClarificationCard({
  question,
  reason,
}: ClarificationCardProps): JSX.Element {
  return (
    <article className="rounded-md border border-amber-300 bg-amber-50/40 px-4 py-3 text-sm">
      <span className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
        Clarifying
      </span>
      <p className="mt-1 text-fg">{question}</p>
      <p className="mt-1 text-xs italic text-fg-muted">Reason: {reason.replaceAll('_', ' ')}</p>
    </article>
  )
}
