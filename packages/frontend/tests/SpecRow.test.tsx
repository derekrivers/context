import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { SpecSummary } from '../src/queries/specs.js'
import { SpecRow } from '../src/components/SpecRow.js'
import { renderWithRouter } from './helpers/router.js'

function makeSummary(overrides: Partial<SpecSummary> = {}): SpecSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'A task tracker',
    status: 'draft',
    owner_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-04-10T12:00:00.000Z',
    updated_at: '2026-04-19T11:00:00.000Z',
    access: 'owner',
    completeness: { overall: 0.33, by_section: { intent: 0.5 } },
    ...overrides,
  }
}

describe('SpecRow', () => {
  afterEach(cleanup)

  it('renders title, status chip, completeness bar, and owner text', async () => {
    const { RouterComponent } = renderWithRouter(
      <SpecRow
        spec={makeSummary()}
        ownerDisplay="alice"
        isOwner
        now={() => new Date('2026-04-19T12:00:00Z')}
      />,
    )
    render(<RouterComponent />)
    expect(await screen.findByText('A task tracker')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('shows "Untitled spec" when title is empty', async () => {
    const { RouterComponent } = renderWithRouter(
      <SpecRow spec={makeSummary({ title: '' })} ownerDisplay="alice" isOwner />,
    )
    render(<RouterComponent />)
    expect(await screen.findByText('Untitled spec')).toBeInTheDocument()
  })

  it('shows an access chip for non-owners', async () => {
    const { RouterComponent } = renderWithRouter(
      <SpecRow
        spec={makeSummary({ access: 'viewer' })}
        ownerDisplay="bob"
        isOwner={false}
      />,
    )
    render(<RouterComponent />)
    expect(await screen.findByText('viewer')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('omits the access chip for owned specs', async () => {
    const { RouterComponent } = renderWithRouter(
      <SpecRow spec={makeSummary()} ownerDisplay="alice" isOwner />,
    )
    render(<RouterComponent />)
    await screen.findByText('A task tracker')
    expect(screen.queryByText('viewer')).toBeNull()
    expect(screen.queryByText('editor')).toBeNull()
  })
})
