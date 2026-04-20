import { useState, type ReactNode } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery.js'
import { cn } from '../../lib/cn.js'

type Tab = 'conversation' | 'spec' | 'context'

export interface AuthoringLayoutProps {
  header: ReactNode
  conversation: ReactNode
  structured: ReactNode
  context: ReactNode
}

export function AuthoringLayout({
  header,
  conversation,
  structured,
  context,
}: AuthoringLayoutProps): JSX.Element {
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const [tab, setTab] = useState<Tab>('conversation')

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <div className="border-b border-border bg-bg">{header}</div>
      {isDesktop ? (
        <main
          role="main"
          className="grid flex-1 grid-cols-[2fr_2fr_1fr] overflow-hidden"
        >
          <section
            role="region"
            aria-label="Conversation"
            className="flex min-h-0 flex-col border-r border-border"
          >
            {conversation}
          </section>
          <section
            role="region"
            aria-label="Structured spec"
            className="flex min-h-0 flex-col border-r border-border"
          >
            {structured}
          </section>
          <section
            role="region"
            aria-label="Context"
            className="flex min-h-0 flex-col"
          >
            {context}
          </section>
        </main>
      ) : (
        <main role="main" className="flex flex-1 flex-col">
          <div
            role="tablist"
            className="flex border-b border-border bg-bg-subtle/40 text-sm"
          >
            <TabButton active={tab === 'conversation'} onClick={() => setTab('conversation')}>
              Conversation
            </TabButton>
            <TabButton active={tab === 'spec'} onClick={() => setTab('spec')}>
              Spec
            </TabButton>
            <TabButton active={tab === 'context'} onClick={() => setTab('context')}>
              Context
            </TabButton>
          </div>
          <section
            role="region"
            aria-label={
              tab === 'conversation'
                ? 'Conversation'
                : tab === 'spec'
                  ? 'Structured spec'
                  : 'Context'
            }
            className="flex min-h-0 flex-1 flex-col"
          >
            {tab === 'conversation' ? conversation : null}
            {tab === 'spec' ? structured : null}
            {tab === 'context' ? context : null}
          </section>
        </main>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-accent text-fg'
          : 'border-transparent text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
