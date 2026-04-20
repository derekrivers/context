import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { hasToken } from '../lib/auth.js'
import { useCreateSpec } from '../queries/specs.js'
import { AppShell } from '../components/AppShell.js'

export const Route = createFileRoute('/specs/new')({
  beforeLoad: () => {
    if (!hasToken()) throw redirect({ to: '/login' })
  },
  component: SpecNewRoute,
})

function SpecNewRoute(): JSX.Element {
  const createSpec = useCreateSpec()
  const navigate = useNavigate()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const created = await createSpec.mutateAsync({ title: 'Untitled spec' })
        await navigate({ to: '/specs/$id', params: { id: created.id }, replace: true })
      } catch {
        await navigate({ to: '/specs', replace: true })
      }
    })()
    // mutate wrapper intentionally triggered only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell>
      <p className="text-sm text-fg-muted">Creating a new spec…</p>
    </AppShell>
  )
}
