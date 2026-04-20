import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { apiGet, ApiError } from '../lib/api.js'
import { hasToken, setToken } from '../lib/auth.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (hasToken()) throw redirect({ to: '/specs' })
  },
  component: LoginRoute,
})

const MeSchema = z.object({ id: z.string().uuid() })

function LoginRoute(): JSX.Element {
  const navigate = useNavigate()
  const [token, setTokenInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    setToken(token.trim())
    try {
      await apiGet('/users/me', MeSchema)
      await navigate({ to: '/specs' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('That token did not work. Check the value and try again.')
      } else if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Network error. Is the backend running?')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 text-fg">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold">Sign in to Context</h1>
        <p className="mb-6 text-sm text-fg-muted">
          Paste the bearer token you were issued.
        </p>
        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="token">Bearer token</Label>
          <Input
            id="token"
            name="token"
            type="password"
            autoComplete="off"
            autoFocus
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={submitting || token.length === 0}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
