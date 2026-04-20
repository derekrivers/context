import { createFileRoute, redirect } from '@tanstack/react-router'
import { hasToken } from '../lib/auth.js'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: hasToken() ? '/specs' : '/login' })
  },
})
