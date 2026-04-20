import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Trash2, Plus, HelpCircle } from 'lucide-react'
import { Input } from '../../ui/input.js'
import { Label } from '../../ui/label.js'
import { Button } from '../../ui/button.js'
import { cn } from '../../../lib/cn.js'
import type { FieldDescriptor } from './fieldMeta.js'
import { useAuthoringReadOnly } from '../../../contexts/AuthoringContexts.js'

export interface FieldRendererProps {
  descriptor: FieldDescriptor
  value: unknown
  onChange: (value: unknown) => void
  error?: string | undefined
}

const DEBOUNCE_MS = 500

export function FieldRenderer(props: FieldRendererProps): JSX.Element {
  const { descriptor } = props
  if (descriptor.kind === 'string') return <StringField {...props} multiline={false} />
  if (descriptor.kind === 'textarea') return <StringField {...props} multiline />
  if (descriptor.kind === 'enum') return <EnumField {...props} />
  if (descriptor.kind === 'boolean') return <BooleanField {...props} />
  if (descriptor.kind === 'number') return <NumberField {...props} />
  if (descriptor.kind === 'chip-array') return <ChipArrayField {...props} />
  if (descriptor.kind === 'object-array') return <ObjectArrayField {...props} />
  return <ObjectField {...props} />
}

function isUnknownValue(v: unknown): v is { unknown: true; reason: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { unknown?: unknown }).unknown === true &&
    typeof (v as { reason?: unknown }).reason === 'string'
  )
}

function StringField({
  descriptor,
  value,
  onChange,
  error,
  multiline,
}: FieldRendererProps & { multiline: boolean }): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const unknown = isUnknownValue(value)
  const current = typeof value === 'string' ? value : unknown ? '' : ''
  const [local, setLocal] = useState(current)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastExternal = useRef<string>(current)

  useEffect(() => {
    if (lastExternal.current !== current) {
      lastExternal.current = current
      setLocal(current)
    }
  }, [current])

  const scheduleSave = (next: string): void => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      onChange(next)
      lastExternal.current = next
    }, DEBOUNCE_MS)
  }

  const flush = (): void => {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    if (local !== lastExternal.current) {
      onChange(local)
      lastExternal.current = local
    }
  }

  if (unknown) return <UnknownFieldShell descriptor={descriptor} value={value as { reason: string }} onChange={onChange} />

  if (readOnly) {
    return (
      <FieldShell descriptor={descriptor} error={error}>
        <p className="whitespace-pre-wrap text-sm text-fg">{local || <em className="text-fg-muted">(not set)</em>}</p>
      </FieldShell>
    )
  }

  return (
    <FieldShell descriptor={descriptor} error={error} showMarkUnknown={!unknown} onMarkUnknown={(reason) => onChange({ unknown: true, reason })}>
      {multiline ? (
        <textarea
          aria-label={descriptor.label}
          className="min-h-[60px] w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            scheduleSave(e.target.value)
          }}
          onBlur={flush}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              flush()
            }
          }}
        />
      ) : (
        <Input
          aria-label={descriptor.label}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            scheduleSave(e.target.value)
          }}
          onBlur={flush}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              flush()
            }
          }}
        />
      )}
    </FieldShell>
  )
}

function EnumField({ descriptor, value, onChange, error }: FieldRendererProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const options = descriptor.options ?? []
  const current = typeof value === 'string' ? value : ''
  return (
    <FieldShell descriptor={descriptor} error={error}>
      {readOnly ? (
        <p className="text-sm">{current || <em className="text-fg-muted">(not set)</em>}</p>
      ) : (
        <select
          aria-label={descriptor.label}
          className="h-9 w-full rounded-md border border-border bg-bg px-2 text-sm"
          value={current}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">(choose)</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  )
}

function BooleanField({ descriptor, value, onChange, error }: FieldRendererProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const current = value === true
  return (
    <FieldShell descriptor={descriptor} error={error}>
      {readOnly ? (
        <p className="text-sm">{current ? 'Yes' : 'No'}</p>
      ) : (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={descriptor.label}
          />
          {current ? 'Yes' : 'No'}
        </label>
      )}
    </FieldShell>
  )
}

function NumberField({ descriptor, value, onChange, error }: FieldRendererProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const current = typeof value === 'number' ? String(value) : ''
  return (
    <FieldShell descriptor={descriptor} error={error}>
      {readOnly ? (
        <p className="text-sm">{current || <em className="text-fg-muted">(not set)</em>}</p>
      ) : (
        <Input
          aria-label={descriptor.label}
          type="number"
          value={current}
          onChange={(e) => {
            const n = e.target.value === '' ? null : Number(e.target.value)
            onChange(n)
          }}
        />
      )}
    </FieldShell>
  )
}

function ChipArrayField({ descriptor, value, onChange, error }: FieldRendererProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const arr = Array.isArray(value) ? (value as string[]) : []
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const t = draft.trim()
    if (t.length === 0) return
    onChange([...arr, t])
    setDraft('')
  }
  const remove = (i: number): void => {
    onChange(arr.filter((_, idx) => idx !== i))
  }

  return (
    <FieldShell descriptor={descriptor} error={error}>
      <div className="flex flex-wrap gap-1.5">
        {arr.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-xs"
          >
            {chip}
            {!readOnly ? (
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => remove(i)}
                className="text-fg-muted hover:text-fg"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {arr.length === 0 ? (
          <span className="text-xs italic text-fg-muted">(none)</span>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            aria-label={`Add to ${descriptor.label}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder="Type and press Enter"
          />
          <Button size="sm" variant="outline" onClick={add} disabled={draft.trim().length === 0}>
            Add
          </Button>
        </div>
      ) : null}
    </FieldShell>
  )
}

function defaultForDescriptor(d: FieldDescriptor): unknown {
  switch (d.kind) {
    case 'string':
    case 'textarea':
    case 'enum':
      return ''
    case 'number':
      return null
    case 'boolean':
      return false
    case 'chip-array':
    case 'object-array':
      return []
    case 'object':
      return {}
  }
}

function defaultObjectFor(desc: FieldDescriptor): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of desc.itemFields ?? []) {
    out[f.path] = defaultForDescriptor(f)
  }
  return out
}

function ObjectArrayField({
  descriptor,
  value,
  onChange,
  error,
}: FieldRendererProps): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  const arr = Array.isArray(value) ? value : []
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null)

  const updateItem = (i: number, itemPath: string, nextValue: unknown): void => {
    const nextArr = arr.map((item, idx) => {
      if (idx !== i) return item
      const copy = { ...(item as Record<string, unknown>) }
      copy[itemPath] = nextValue
      return copy
    })
    onChange(nextArr)
  }

  const add = useCallback((): void => {
    const next = [...arr, defaultObjectFor(descriptor)]
    onChange(next)
  }, [arr, descriptor, onChange])

  const removeIdx = (i: number): void => {
    onChange(arr.filter((_, idx) => idx !== i))
    setConfirmingRemove(null)
  }

  return (
    <FieldShell descriptor={descriptor} error={error} stacked>
      <div className="flex flex-col gap-3">
        {arr.map((item, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-bg-subtle/40 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-fg-muted">
                {descriptor.itemLabel ?? 'item'} #{i + 1}
              </span>
              {!readOnly ? (
                confirmingRemove === i ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span>Are you sure?</span>
                    <button
                      className="underline"
                      onClick={() => removeIdx(i)}
                    >
                      Remove
                    </button>
                    <button
                      className="underline text-fg-muted"
                      onClick={() => setConfirmingRemove(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-fg-muted hover:text-fg"
                    aria-label="Remove item"
                    onClick={() => setConfirmingRemove(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              {(descriptor.itemFields ?? []).map((f) => (
                <FieldRenderer
                  key={f.path}
                  descriptor={f}
                  value={(item as Record<string, unknown>)[f.path]}
                  onChange={(v) => updateItem(i, f.path, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {!readOnly ? (
        <Button size="sm" variant="outline" onClick={add} className="mt-3">
          <Plus className="mr-1 h-4 w-4" />
          Add {descriptor.itemLabel ?? 'item'}
        </Button>
      ) : null}
    </FieldShell>
  )
}

function ObjectField({
  descriptor,
  value,
  onChange,
  error,
}: FieldRendererProps): JSX.Element {
  const obj = (value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {})
  const updateKey = (key: string, next: unknown): void => {
    onChange({ ...obj, [key]: next })
  }
  return (
    <FieldShell descriptor={descriptor} error={error} stacked>
      <div className="flex flex-col gap-3">
        {(descriptor.itemFields ?? []).map((f) => (
          <FieldRenderer
            key={f.path}
            descriptor={f}
            value={obj[f.path]}
            onChange={(v) => updateKey(f.path, v)}
          />
        ))}
      </div>
    </FieldShell>
  )
}

interface FieldShellProps {
  descriptor: FieldDescriptor
  error?: string | undefined
  showMarkUnknown?: boolean
  onMarkUnknown?: (reason: string) => void
  stacked?: boolean
  children: React.ReactNode
}

function FieldShell({
  descriptor,
  error,
  showMarkUnknown = false,
  onMarkUnknown,
  stacked = false,
  children,
}: FieldShellProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1', stacked ? 'gap-2' : 'gap-1')}>
      <div className="flex items-center justify-between">
        <Label>{descriptor.label}</Label>
        {showMarkUnknown && onMarkUnknown ? (
          <MarkUnknownButton onConfirm={(r) => onMarkUnknown(r)} />
        ) : null}
      </div>
      {children}
      {descriptor.help ? (
        <p className="text-xs text-fg-muted">{descriptor.help}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  )
}

function MarkUnknownButton({
  onConfirm,
}: {
  onConfirm: (reason: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open) {
    return (
      <button
        type="button"
        aria-label="Mark as unknown"
        className="text-fg-muted hover:text-fg"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label="Reason for unknown"
        value={reason}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
        placeholder="Why unknown?"
        className="h-7 w-48 text-xs"
      />
      <Button
        size="sm"
        onClick={() => {
          if (reason.trim().length > 0) onConfirm(reason.trim())
          setOpen(false)
          setReason('')
        }}
      >
        Mark
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}

function UnknownFieldShell({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FieldDescriptor
  value: { reason: string }
  onChange: (v: unknown) => void
}): JSX.Element {
  const { readOnly } = useAuthoringReadOnly()
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed border-border bg-bg-subtle/30 px-3 py-2">
      <Label>{descriptor.label}</Label>
      <p className="text-sm italic text-fg-muted">Unknown</p>
      <p className="text-xs text-fg-muted">{value.reason}</p>
      {!readOnly ? (
        <button
          type="button"
          className="text-xs underline self-start"
          onClick={() => onChange(defaultForDescriptor(descriptor))}
        >
          Set value
        </button>
      ) : null}
    </div>
  )
}
