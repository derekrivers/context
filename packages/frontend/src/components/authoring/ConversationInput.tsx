import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../ui/button.js'
import { cn } from '../../lib/cn.js'

export interface ConversationInputProps {
  disabled?: boolean
  pending?: boolean
  onSend: (text: string) => void | Promise<void>
  onSkip?: () => void | Promise<void>
  skipDisabled?: boolean
}

export function ConversationInput({
  disabled = false,
  pending = false,
  onSend,
  onSkip,
  skipDisabled,
}: ConversationInputProps): JSX.Element {
  const [value, setValue] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)

  const send = async (): Promise<void> => {
    const trimmed = value.trim()
    if (trimmed.length === 0 || disabled || pending) return
    const toSend = trimmed
    setValue('')
    await onSend(toSend)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void send()
    }
  }

  const dontKnow = (): void => {
    setValue("I don't know because ")
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(value.length, value.length)
    })
  }

  return (
    <div className="border-t border-border bg-bg px-4 pb-3 pt-2">
      <div className="mb-1 flex gap-3 text-xs text-fg-muted">
        <button
          type="button"
          disabled={disabled || pending || !onSkip || skipDisabled}
          onClick={() => {
            if (onSkip) void onSkip()
          }}
          className="underline disabled:opacity-50"
        >
          Skip this question
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={dontKnow}
          className="underline disabled:opacity-50"
        >
          I don't know
        </button>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={textarea}
          className={cn(
            'min-h-[40px] w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
          rows={2}
          disabled={disabled || pending}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? 'Editing is disabled.'
              : pending
                ? 'Thinking…'
                : 'Answer here. Enter to send, Shift+Enter for newline.'
          }
          aria-label="Your answer"
        />
        <Button onClick={() => void send()} disabled={disabled || pending || value.trim().length === 0}>
          {pending ? 'Sending…' : 'Send'}
        </Button>
      </div>
      {pending ? (
        <p className="mt-1 text-xs text-fg-muted">Parsing your answer…</p>
      ) : null}
    </div>
  )
}
