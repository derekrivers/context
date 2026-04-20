import { useMemo } from 'react'
import type { LockState } from '../../queries/authoring.js'

export interface LockBannerProps {
  lockState: LockState
  currentUserId: string
}

export function LockBanner({
  lockState,
  currentUserId,
}: LockBannerProps): JSX.Element | null {
  const remainingMinutes = useMemo(() => {
    if (!lockState.lock_expires_at) return null
    const diff = new Date(lockState.lock_expires_at).getTime() - Date.now()
    if (diff <= 0) return 0
    return Math.ceil(diff / 60_000)
  }, [lockState.lock_expires_at])

  if (!lockState.locked_by) return null
  if (lockState.locked_by === currentUserId) return null

  const holder = lockState.holder?.name ?? lockState.holder?.id.slice(0, 8) ?? 'another user'
  const suffix =
    remainingMinutes === null
      ? '.'
      : remainingMinutes === 0
        ? '. Their lease has expired; it should release shortly.'
        : `. Their lease expires in ${remainingMinutes}m.`

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900"
    >
      Locked by {holder}
      {suffix} Editing is disabled.
    </div>
  )
}
