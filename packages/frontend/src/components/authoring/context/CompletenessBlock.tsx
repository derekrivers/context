import type { CompletenessReport, SectionKey } from '@context/spec-schema'
import { cn } from '../../../lib/cn.js'

const SECTION_THRESHOLDS: Record<SectionKey, number> = {
  intent: 0.95,
  domain_model: 0.8,
  capabilities: 0.8,
  flows: 0.6,
  constraints: 0.6,
  references: 0.2,
}

const SECTION_ORDER: readonly SectionKey[] = [
  'intent',
  'domain_model',
  'capabilities',
  'flows',
  'constraints',
  'references',
]

const SECTION_LABELS: Record<SectionKey, string> = {
  intent: 'intent',
  domain_model: 'domain model',
  capabilities: 'capabilities',
  flows: 'flows',
  constraints: 'constraints',
  references: 'references',
}

export interface CompletenessBlockProps {
  report: CompletenessReport
  onSectionClick?: (section: SectionKey) => void
}

export function CompletenessBlock({
  report,
  onSectionClick,
}: CompletenessBlockProps): JSX.Element {
  const pct = Math.round(report.overall * 100)
  const label = overallLabel(report, pct)

  return (
    <section className="border-b border-border p-4">
      <div className="mb-3">
        <p className="text-3xl font-semibold">{pct}%</p>
        <p className="text-xs text-fg-muted">{label}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {SECTION_ORDER.map((key) => (
          <SectionBar
            key={key}
            label={SECTION_LABELS[key]}
            score={report.bySection[key].score}
            threshold={SECTION_THRESHOLDS[key]}
            onClick={onSectionClick ? () => onSectionClick(key) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

function overallLabel(report: CompletenessReport, pct: number): string {
  const allMet = SECTION_ORDER.every(
    (k) => report.bySection[k].score >= SECTION_THRESHOLDS[k],
  )
  if (allMet) return 'Complete'
  if (pct < 15) return 'Just started'
  return 'In progress'
}

interface SectionBarProps {
  label: string
  score: number
  threshold: number
  onClick?: (() => void) | undefined
}

function SectionBar({ label, score, threshold, onClick }: SectionBarProps): JSX.Element {
  const pct = Math.round(score * 100)
  const thresholdPct = Math.round(threshold * 100)
  const met = score >= threshold
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-bg-subtle disabled:hover:bg-transparent',
      )}
      aria-label={`${label}: ${pct}%`}
    >
      <span className="w-24 shrink-0 text-fg-muted">{label}</span>
      <span className="relative h-1.5 flex-1 rounded-full bg-bg-subtle">
        <span
          className={cn(
            'absolute left-0 top-0 h-full rounded-full transition-all',
            met ? 'bg-accent/80' : 'bg-fg-muted/40',
          )}
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute top-0 h-full w-px bg-fg-muted/60"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="w-10 shrink-0 text-right text-fg-muted">{pct}%</span>
    </button>
  )
}
