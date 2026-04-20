import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { hasToken } from '../lib/auth.js'
import { useSpec } from '../queries/specs.js'
import { AppShell } from '../components/AppShell.js'
import { Button } from '../components/ui/button.js'

export const Route = createFileRoute('/specs/$id')({
  beforeLoad: () => {
    if (!hasToken()) throw redirect({ to: '/login' })
  },
  component: SpecDetailRoute,
})

function SpecDetailRoute(): JSX.Element {
  const { id } = Route.useParams()
  const spec = useSpec(id)

  const title =
    spec.data?.spec.intent.summary && spec.data.spec.intent.summary.length > 0
      ? spec.data.spec.intent.summary
      : 'Untitled spec'

  return (
    <AppShell>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/specs">
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Back to specs
          </Link>
        </Button>
      </div>
      {spec.isLoading ? (
        <div className="h-32 w-full animate-pulse rounded-md bg-bg-subtle" />
      ) : spec.isError ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          Could not load this spec.
        </div>
      ) : spec.data ? (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 font-mono text-xs text-fg-muted">{spec.data.id}</p>
          </div>
          <p className="rounded-md border border-dashed border-border bg-bg-subtle/30 p-4 text-sm text-fg-muted">
            Authoring view coming soon (T-08). This spec exists in the backend and
            can be inspected via the API.
          </p>
        </div>
      ) : null}
    </AppShell>
  )
}
