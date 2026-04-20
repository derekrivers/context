import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { AuthoringLayout } from '../src/components/authoring/AuthoringLayout.js'

function matchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('AuthoringLayout', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the 3 pane children on desktop', () => {
    matchMedia(true)
    render(
      <AuthoringLayout
        header={<div>HEADER</div>}
        conversation={<div>CONV</div>}
        structured={<div>STRUCT</div>}
        context={<div>CTX</div>}
      />,
    )
    expect(screen.getByText('HEADER')).toBeInTheDocument()
    expect(screen.getByText('CONV')).toBeInTheDocument()
    expect(screen.getByText('STRUCT')).toBeInTheDocument()
    expect(screen.getByText('CTX')).toBeInTheDocument()
  })

  it('renders the tabbed fallback below 1280px and defaults to conversation', () => {
    matchMedia(false)
    render(
      <AuthoringLayout
        header={<div>HEADER</div>}
        conversation={<div>CONV</div>}
        structured={<div>STRUCT</div>}
        context={<div>CTX</div>}
      />,
    )
    expect(screen.getByText('CONV')).toBeInTheDocument()
    expect(screen.queryByText('STRUCT')).toBeNull()
    expect(screen.queryByText('CTX')).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('switches tabs when clicked', () => {
    matchMedia(false)
    render(
      <AuthoringLayout
        header={<div>HEADER</div>}
        conversation={<div>CONV</div>}
        structured={<div>STRUCT</div>}
        context={<div>CTX</div>}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Spec' }))
    expect(screen.getByText('STRUCT')).toBeInTheDocument()
    expect(screen.queryByText('CONV')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Context' }))
    expect(screen.getByText('CTX')).toBeInTheDocument()
  })
})
