export interface AccessBannerProps {
  access: 'owner' | 'editor' | 'viewer' | undefined
  ownerDisplay: string
}

export function AccessBanner({ access, ownerDisplay }: AccessBannerProps): JSX.Element | null {
  if (!access || access === 'owner') return null
  const suffix = access === 'viewer' ? ' — read-only.' : '.'
  return (
    <div
      role="status"
      className="border-b border-border bg-bg-subtle/60 px-6 py-2 text-sm text-fg-muted"
    >
      Shared with you by {ownerDisplay}
      {suffix}
    </div>
  )
}
