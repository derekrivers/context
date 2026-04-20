import type { SpecStatus } from '@context/spec-schema'
import { cn } from '../lib/cn.js'

const STATUS_LABELS: Record<SpecStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  sent: 'Sent',
  archived: 'Archived',
}

const STATUS_CLASSES: Record<SpecStatus, string> = {
  draft: 'bg-status-draft/20 text-status-draft',
  ready: 'bg-status-ready/20 text-status-ready',
  sent: 'bg-status-sent/20 text-status-sent',
  archived: 'bg-status-archived/20 text-status-archived',
}

export interface StatusChipProps {
  status: SpecStatus
  className?: string
}

export function StatusChip({ status, className }: StatusChipProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
