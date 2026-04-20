import { createContext, useContext, type ReactNode } from 'react'

interface AuthoringReadOnlyValue {
  readOnly: boolean
  reason: 'owner' | 'viewer_share' | 'locked_by_other' | 'lock_lost' | null
}

const AuthoringReadOnlyContext = createContext<AuthoringReadOnlyValue>({
  readOnly: false,
  reason: null,
})

export function AuthoringReadOnlyProvider({
  value,
  children,
}: {
  value: AuthoringReadOnlyValue
  children: ReactNode
}): JSX.Element {
  return (
    <AuthoringReadOnlyContext.Provider value={value}>
      {children}
    </AuthoringReadOnlyContext.Provider>
  )
}

export function useAuthoringReadOnly(): AuthoringReadOnlyValue {
  return useContext(AuthoringReadOnlyContext)
}

interface AuthoringActiveValue {
  activeTargetPath: string | null
  activeSection: string | null
  activeSelectionTurnId: string | null
}

const AuthoringContext = createContext<AuthoringActiveValue>({
  activeTargetPath: null,
  activeSection: null,
  activeSelectionTurnId: null,
})

export function AuthoringProvider({
  value,
  children,
}: {
  value: AuthoringActiveValue
  children: ReactNode
}): JSX.Element {
  return (
    <AuthoringContext.Provider value={value}>{children}</AuthoringContext.Provider>
  )
}

export function useAuthoring(): AuthoringActiveValue {
  return useContext(AuthoringContext)
}
