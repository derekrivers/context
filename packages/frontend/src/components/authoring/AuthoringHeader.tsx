import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { StatusChip } from '../StatusChip.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { ExportJsonButton } from './ExportJsonButton.js'
import { SendToRedDwarfButton } from './SendToRedDwarfButton.js'
import { useAuthoringReadOnly } from '../../contexts/AuthoringContexts.js'
import type { SpecDetail } from '../../queries/authoring.js'

const DEBOUNCE_MS = 500

export interface AuthoringHeaderProps {
  spec: SpecDetail | undefined
  onTitleChange: (title: string) => Promise<void> | void
}

export function AuthoringHeader({
  spec,
  onTitleChange,
}: AuthoringHeaderProps): JSX.Element {
  const [localTitle, setLocalTitle] = useState<string>(spec?.title ?? '')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialised = useRef(false)
  const { readOnly } = useAuthoringReadOnly()

  useEffect(() => {
    if (!initialised.current && spec) {
      setLocalTitle(spec.title)
      initialised.current = true
    }
  }, [spec])

  const scheduleSave = (next: string): void => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      void Promise.resolve(onTitleChange(next.trim())).then(() => {
        setSavedAt(Date.now())
      })
    }, DEBOUNCE_MS)
  }

  const flushSave = async (): Promise<void> => {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    await Promise.resolve(onTitleChange(localTitle.trim()))
    setSavedAt(Date.now())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.currentTarget.blur()
      if (spec) setLocalTitle(spec.title)
      if (debounce.current) clearTimeout(debounce.current)
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void flushSave()
    }
  }

  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 1000)
    return () => clearTimeout(t)
  }, [savedAt])

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/specs">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Back to specs</span>
          </Link>
        </Button>
        <Input
          aria-label="Spec title"
          placeholder="Untitled spec"
          value={localTitle}
          readOnly={readOnly}
          onChange={(e) => {
            const next = e.target.value
            setLocalTitle(next)
            if (!readOnly) scheduleSave(next)
          }}
          onKeyDown={onKeyDown}
          className="max-w-md border-transparent bg-transparent text-base font-semibold focus-visible:bg-bg"
        />
        {spec ? <StatusChip status={spec.status} /> : null}
        {savedAt ? (
          <span className="text-xs text-fg-muted" role="status">
            Saved
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <ExportJsonButton spec={spec} />
        <SendToRedDwarfButton />
      </div>
    </div>
  )
}
