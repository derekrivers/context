import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { hasToken } from '../lib/auth.js'
import { useMe, useCreateSpec, useSpecs } from '../queries/specs.js'
import { AppShell } from '../components/AppShell.js'
import { SpecRow } from '../components/SpecRow.js'
import { Button } from '../components/ui/button.js'

export const Route = createFileRoute('/specs/')({
  beforeLoad: () => {
    if (!hasToken()) throw redirect({ to: '/login' })
  },
  component: SpecListRoute,
})

function SpecListRoute(): JSX.Element {
  const specs = useSpecs()
  const me = useMe()
  const navigate = useNavigate()
  const createSpec = useCreateSpec()

  const createNew = async (): Promise<void> => {
    const created = await createSpec.mutateAsync({ title: 'Untitled spec' })
    await navigate({ to: '/specs/$id', params: { id: created.id } })
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your specs</h1>
        <Button onClick={() => void createNew()} disabled={createSpec.isPending}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {createSpec.isPending ? 'Creating…' : 'New spec'}
        </Button>
      </div>

      {specs.isLoading ? (
        <SpecListSkeleton />
      ) : specs.isError ? (
        <ErrorState onRetry={() => void specs.refetch()} />
      ) : specs.data && specs.data.specs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {specs.data.specs.map((s) => (
            <li key={s.id}>
              <SpecRow
                spec={s}
                isOwner={me.data?.id === s.owner_id}
                ownerDisplay={s.owner_id.slice(0, 8)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState onCreate={() => void createNew()} pending={createSpec.isPending} />
      )}
    </AppShell>
  )
}

function SpecListSkeleton(): JSX.Element {
  return (
    <ul className="flex flex-col gap-2" aria-label="Loading specs">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-16 w-full animate-pulse rounded-md border border-border bg-bg-subtle"
        />
      ))}
    </ul>
  )
}

function EmptyState({
  onCreate,
  pending,
}: {
  onCreate: () => void
  pending: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-bg-subtle/40 py-16 text-center">
      <p className="text-sm text-fg-muted">No specs yet. Create one to start.</p>
      <Button onClick={onCreate} disabled={pending}>
        {pending ? 'Creating…' : 'New spec'}
      </Button>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <p className="mb-2 font-medium">We couldn't load your specs.</p>
      <p className="mb-3 text-red-900/80">
        Check your network and the backend status.{' '}
        <Link to="/login" className="underline">
          Or sign in again.
        </Link>
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
