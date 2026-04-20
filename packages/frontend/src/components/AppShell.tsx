import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMe } from '../queries/specs.js'
import { clearToken } from '../lib/auth.js'
import { Button } from './ui/button.js'

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const handleLogout = (): void => {
    clearToken()
    qc.clear()
    void navigate({ to: '/login' })
  }

  const displayName = me.data?.name && me.data.name.length > 0 ? me.data.name : me.data?.id ?? ''

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/specs" className="text-base font-semibold">
            Context
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {displayName ? (
              <span className="text-fg-muted" title={me.data?.id ?? ''}>
                {displayName}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
