import { Download } from 'lucide-react'
import type { SpecDetail } from '../../queries/authoring.js'
import { Button } from '../ui/button.js'

export interface ExportJsonButtonProps {
  spec: SpecDetail | undefined
}

export function ExportJsonButton({ spec }: ExportJsonButtonProps): JSX.Element {
  const onClick = (): void => {
    if (!spec) return
    const date = new Date().toISOString().slice(0, 10)
    const filename = `${spec.id}-${date}.json`
    const blob = new Blob([JSON.stringify(spec.spec, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={!spec}
      aria-label="Export spec as JSON"
    >
      <Download className="mr-1 h-4 w-4" aria-hidden="true" />
      Export JSON
    </Button>
  )
}
