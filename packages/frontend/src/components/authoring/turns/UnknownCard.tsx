export interface UnknownCardProps {
  reason: string
  path: string
}

export function UnknownCard({ reason, path }: UnknownCardProps): JSX.Element {
  return (
    <article className="ml-auto max-w-[90%] rounded-md border border-dashed border-border bg-bg-subtle/30 px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-fg-muted">
          Unknown
        </span>
        <span className="font-mono text-xs text-fg-muted">{path}</span>
      </div>
      <p className="mt-2 text-fg">{reason}</p>
    </article>
  )
}
