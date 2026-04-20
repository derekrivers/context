export interface TerminalTurnCardProps {
  kind: 'turn_cap_reached' | 'token_cap_reached'
  limit: number
  used: number
}

export function TerminalTurnCard({
  kind,
  limit,
  used,
}: TerminalTurnCardProps): JSX.Element {
  const heading =
    kind === 'turn_cap_reached'
      ? "We've talked through this for a while."
      : "We've used the token budget for this spec."
  return (
    <article className="rounded-md border-2 border-dashed border-border bg-bg-subtle/40 px-4 py-4 text-sm">
      <h3 className="text-base font-semibold text-fg">{heading}</h3>
      <p className="mt-2 text-fg-muted">
        Review the spec on the right. If there's more to add, you can edit it
        directly or raise unresolved questions. To continue the conversation, an
        operator needs to raise the {kind === 'turn_cap_reached' ? 'turn' : 'token'} cap
        for this spec.
      </p>
      <p className="mt-2 text-xs text-fg-muted">
        Used {used} of {limit}.
      </p>
    </article>
  )
}
