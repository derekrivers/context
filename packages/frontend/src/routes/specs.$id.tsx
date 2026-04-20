import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { hasToken } from '../lib/auth.js'
import {
  useAcquireLock,
  useLockState,
  usePatchSpec,
  useReleaseLock,
  useSpecDetail,
  useTurns,
} from '../queries/authoring.js'
import { AuthoringLayout } from '../components/authoring/AuthoringLayout.js'
import { AuthoringHeader } from '../components/authoring/AuthoringHeader.js'
import { LockBanner } from '../components/authoring/LockBanner.js'
import { AccessBanner } from '../components/authoring/AccessBanner.js'
import { ConversationPane } from '../components/authoring/ConversationPane.js'
import { StructuredPane } from '../components/authoring/StructuredPane.js'
import { ContextPane } from '../components/authoring/ContextPane.js'
import {
  AuthoringProvider,
  AuthoringReadOnlyProvider,
} from '../contexts/AuthoringContexts.js'
import { useMe } from '../queries/specs.js'

export const Route = createFileRoute('/specs/$id')({
  beforeLoad: () => {
    if (!hasToken()) throw redirect({ to: '/login' })
  },
  component: AuthoringRoute,
})

const LEASE_RENEWAL_MS = 2 * 60_000

function AuthoringRoute(): JSX.Element {
  const { id } = Route.useParams()
  const specQuery = useSpecDetail(id)
  const lockQuery = useLockState(id)
  const me = useMe()
  const turnsQuery = useTurns(id)
  const patchSpec = usePatchSpec(id)
  const acquireLock = useAcquireLock(id)
  const releaseLock = useReleaseLock(id)

  const acquiredRef = useRef(false)
  const access = specQuery.data?.access
  const isViewer = access === 'viewer'
  const canEdit = !isViewer

  useEffect(() => {
    if (!canEdit) return
    if (acquiredRef.current) return
    if (!specQuery.data) return
    const lockedByOther =
      lockQuery.data?.locked_by && lockQuery.data.locked_by !== me.data?.id
    if (lockedByOther) return
    acquiredRef.current = true
    void acquireLock.mutateAsync().catch(() => {
      acquiredRef.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, specQuery.data?.id, lockQuery.data?.locked_by, me.data?.id])

  useEffect(() => {
    if (!canEdit) return
    const holder = lockQuery.data?.locked_by
    const meId = me.data?.id
    if (!holder || holder !== meId) return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = (): void => {
      if (timer) return
      timer = setInterval(() => {
        void acquireLock.mutateAsync().catch(() => {})
      }, LEASE_RENEWAL_MS)
    }
    const stop = (): void => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, lockQuery.data?.locked_by, me.data?.id])

  useEffect(() => {
    if (!canEdit) return
    const holder = lockQuery.data?.locked_by
    const meId = me.data?.id
    const releaseOnUnload = (): void => {
      if (holder === meId) {
        try {
          const headers: Record<string, string> = {}
          const token = window.sessionStorage.getItem('context.token')
          if (token) headers.Authorization = `Bearer ${token}`
          fetch(`/api/specs/${id}/lock`, {
            method: 'DELETE',
            headers,
            keepalive: true,
          }).catch(() => {})
        } catch {
          /* noop */
        }
      }
    }
    window.addEventListener('beforeunload', releaseOnUnload)
    return () => {
      window.removeEventListener('beforeunload', releaseOnUnload)
      if (holder === meId) {
        void releaseLock.mutateAsync().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, id, lockQuery.data?.locked_by, me.data?.id])

  const readOnlyValue = useMemo(() => {
    if (isViewer) return { readOnly: true, reason: 'viewer_share' as const }
    const holder = lockQuery.data?.locked_by
    if (holder && holder !== me.data?.id) {
      return { readOnly: true, reason: 'locked_by_other' as const }
    }
    return { readOnly: false, reason: null }
  }, [isViewer, lockQuery.data?.locked_by, me.data?.id])

  const latestSelection = useMemo(() => {
    const turns = turnsQuery.data?.turns ?? []
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i]!
      if (t.phase === 'selection') return t
    }
    return null
  }, [turnsQuery.data])

  const authoringValue = useMemo(
    () => ({
      activeTargetPath: latestSelection?.target_path ?? null,
      activeSection: latestSelection?.target_section ?? null,
      activeSelectionTurnId: latestSelection?.id ?? null,
    }),
    [latestSelection?.id, latestSelection?.target_path, latestSelection?.target_section],
  )

  const header = (
    <>
      <AuthoringHeader
        spec={specQuery.data}
        onTitleChange={async (title) => {
          if (!specQuery.data) return
          if (title === specQuery.data.title) return
          await patchSpec.mutateAsync({ title: title.length > 0 ? title : 'Untitled spec' })
        }}
      />
      {me.data ? (
        <LockBanner
          lockState={
            lockQuery.data ?? {
              spec_id: id,
              locked_by: null,
              lock_expires_at: null,
              held_by_caller: false,
              holder: null,
            }
          }
          currentUserId={me.data.id}
        />
      ) : null}
      <AccessBanner
        access={access}
        ownerDisplay={specQuery.data?.owner_id.slice(0, 8) ?? 'the owner'}
      />
    </>
  )

  return (
    <AuthoringReadOnlyProvider value={readOnlyValue}>
      <AuthoringProvider value={authoringValue}>
        <AuthoringLayout
          header={header}
          conversation={<ConversationPane specId={id} />}
          structured={<StructuredPane />}
          context={<ContextPane />}
        />
      </AuthoringProvider>
    </AuthoringReadOnlyProvider>
  )
}
