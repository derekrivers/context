import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeCompleteness,
  type CanonicalSpec,
  type SectionKey as SchemaSectionKey,
} from '@context/spec-schema'
import { FieldRenderer } from './structured/FieldRenderer.js'
import { SectionAccordion } from './structured/SectionAccordion.js'
import { SECTION_DESCRIPTORS } from './structured/fieldMeta.js'
import { getAtPath, setAtPath } from './structured/pathUtils.js'
import { useAuthoring, useAuthoringReadOnly } from '../../contexts/AuthoringContexts.js'
import { ApiError } from '../../lib/api.js'
import { usePatchSpec, useSpecDetail } from '../../queries/authoring.js'

export interface StructuredPaneProps {
  specId: string
}

const DEBOUNCE_MS = 500

export function StructuredPane({ specId }: StructuredPaneProps): JSX.Element {
  const specQuery = useSpecDetail(specId)
  const patchSpec = usePatchSpec(specId)
  const { readOnly } = useAuthoringReadOnly()
  const { activeSection, activeTargetPath } = useAuthoring()

  const spec = specQuery.data?.spec
  const [localSpec, setLocalSpec] = useState<CanonicalSpec | null>(spec ?? null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastServer = useRef<CanonicalSpec | null>(spec ?? null)

  useEffect(() => {
    if (!spec) return
    if (lastServer.current === spec) return
    lastServer.current = spec
    setLocalSpec(spec)
  }, [spec])

  const [advanced, setAdvanced] = useState(false)
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(new Set())
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!activeSection) return
    setManuallyExpanded((prev) => {
      if (prev.has(activeSection)) return prev
      if (manuallyCollapsed.has(activeSection)) return prev
      const next = new Set(prev)
      next.add(activeSection)
      return next
    })
  }, [activeSection, manuallyCollapsed])

  const isExpanded = (key: string): boolean => {
    if (manuallyCollapsed.has(key)) return false
    if (manuallyExpanded.has(key)) return true
    if (key === 'intent') return true
    return false
  }

  const toggle = (key: string): void => {
    const expanded = isExpanded(key)
    setManuallyExpanded((prev) => {
      const next = new Set(prev)
      if (expanded) next.delete(key)
      else next.add(key)
      return next
    })
    setManuallyCollapsed((prev) => {
      const next = new Set(prev)
      if (expanded) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const scheduleSave = (next: CanonicalSpec): void => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      void patchSpec
        .mutateAsync({ spec: next })
        .then(() => {
          setFieldErrors({})
          lastServer.current = next
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 400) {
            const details = (err.body as {
              details?: { fieldErrors?: Record<string, string[]> }
            })?.details
            if (details?.fieldErrors) {
              const nextErrs: Record<string, string> = {}
              for (const [k, msgs] of Object.entries(details.fieldErrors)) {
                const first = msgs[0]
                if (first) nextErrs[k] = first
              }
              setFieldErrors(nextErrs)
              return
            }
            setFieldErrors({ _root: err.message })
            return
          }
          if (lastServer.current) setLocalSpec(lastServer.current)
        })
    }, DEBOUNCE_MS)
  }

  const updatePath = (path: string, value: unknown): void => {
    if (!localSpec) return
    const next = setAtPath(localSpec, path, value) as CanonicalSpec
    setLocalSpec(next)
    scheduleSave(next)
  }

  const completeness = useMemo(() => {
    if (!localSpec) return null
    return computeCompleteness(localSpec)
  }, [localSpec])

  if (!localSpec) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">
        Loading spec…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      {fieldErrors._root ? (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          {fieldErrors._root}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {SECTION_DESCRIPTORS.filter((s) => !s.advanced || advanced).map((s) => {
          const progress = completeness ? sectionProgress(s.key, completeness) : undefined
          return (
            <SectionAccordion
              key={s.key}
              label={s.label}
              expanded={isExpanded(s.key)}
              onToggle={() => toggle(s.key)}
              progress={progress}
              description={s.description}
            >
              <div className="flex flex-col gap-4">
                {s.fields.length === 0 ? (
                  <p className="text-xs italic text-fg-muted">
                    {s.key === 'provenance'
                      ? renderProvenance(localSpec)
                      : s.key === 'extensions'
                        ? renderExtensions(localSpec)
                        : null}
                  </p>
                ) : (
                  s.fields.map((f) => (
                    <FieldRenderer
                      key={f.path}
                      descriptor={f}
                      value={getAtPath(localSpec, f.path)}
                      onChange={(v) => updatePath(f.path, v)}
                      error={fieldErrors[f.path]}
                    />
                  ))
                )}
              </div>
            </SectionAccordion>
          )
        })}
        <button
          type="button"
          className="self-start text-xs text-fg-muted underline"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? 'Hide advanced' : 'Show advanced'}
        </button>
      </div>
      {!readOnly && activeTargetPath ? (
        <p className="mt-3 text-xs text-fg-muted">
          The conversation is currently about:{' '}
          <span className="font-mono">{activeTargetPath}</span>
        </p>
      ) : null}
    </div>
  )
}

function sectionProgress(
  key: string,
  completeness: ReturnType<typeof computeCompleteness>,
): { filled: number; total: number } | undefined {
  const section = completeness.bySection[key as SchemaSectionKey]
  if (!section) return undefined
  return { filled: section.present, total: section.total }
}

function renderProvenance(spec: CanonicalSpec): string {
  const authors = spec.provenance.authors.map((a) => a.name ?? a.id).join(', ')
  const unresolved = spec.provenance.unresolved_questions.length
  return `Authors: ${authors}. Unresolved questions: ${unresolved}.`
}

function renderExtensions(spec: CanonicalSpec): string {
  const keys = Object.keys(spec.extensions)
  return keys.length === 0 ? 'No extensions set.' : `Keys: ${keys.join(', ')}`
}
