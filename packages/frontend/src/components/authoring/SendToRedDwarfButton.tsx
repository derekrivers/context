import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '../ui/button.js'

const FLAG = import.meta.env.VITE_CONTEXT_SEND_TO_REDDWARF_ENABLED === 'true'

export function SendToRedDwarfButton(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!FLAG) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="mr-1 h-4 w-4" aria-hidden="true" />
        Send to RedDwarf
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send to RedDwarf"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-md rounded-md border border-border bg-bg p-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-semibold">Send to RedDwarf</h2>
            <p className="mb-4 text-fg-muted">
              Requires T-09 (adapter) and T-10 (injection endpoint) to be live.
              Once those land, this dialog will preview the ProjectSpec payload
              and confirm the send.
            </p>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
