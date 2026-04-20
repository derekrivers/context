import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectionCard } from '../src/components/authoring/turns/SelectionCard.js'
import { AnswerCard } from '../src/components/authoring/turns/AnswerCard.js'
import { ClarificationCard } from '../src/components/authoring/turns/ClarificationCard.js'
import { ContradictionCard } from '../src/components/authoring/turns/ContradictionCard.js'
import { SkipCard } from '../src/components/authoring/turns/SkipCard.js'
import { UnknownCard } from '../src/components/authoring/turns/UnknownCard.js'
import { TerminalTurnCard } from '../src/components/authoring/TerminalTurnCard.js'
import { LockBanner } from '../src/components/authoring/LockBanner.js'
import { AccessBanner } from '../src/components/authoring/AccessBanner.js'
import { ExportJsonButton } from '../src/components/authoring/ExportJsonButton.js'

describe('turn cards', () => {
  afterEach(cleanup)

  it('SelectionCard shows question and target path', () => {
    render(
      <SelectionCard question="What's it for?" targetPath="intent.summary" section="intent" />,
    )
    expect(screen.getByText("What's it for?")).toBeInTheDocument()
    expect(screen.getByText(/intent.intent.summary/)).toBeInTheDocument()
  })

  it('AnswerCard shows confidence chip only for medium or low', () => {
    const { rerender } = render(<AnswerCard text="hi" confidence="high" />)
    expect(screen.queryByText(/confidence/)).toBeNull()
    rerender(<AnswerCard text="hi" confidence="medium" />)
    expect(screen.getByText('medium confidence')).toBeInTheDocument()
    rerender(<AnswerCard text="hi" confidence="low" />)
    expect(screen.getByText('low confidence')).toBeInTheDocument()
  })

  it('ClarificationCard renders reason text', () => {
    render(<ClarificationCard question="which tenant?" reason="contradicts_existing_spec" />)
    expect(screen.getByText('Clarifying')).toBeInTheDocument()
    expect(screen.getByText(/contradicts existing spec/)).toBeInTheDocument()
  })

  it('ContradictionCard fires the correct callbacks', () => {
    const onKeepOld = vi.fn()
    const onUseNew = vi.fn()
    render(
      <ContradictionCard
        question="Which is it?"
        oldValue="single tenant"
        newValue="multi tenant"
        path="constraints.platform"
        onKeepOld={onKeepOld}
        onUseNew={onUseNew}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep old value' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use new value' }))
    expect(onKeepOld).toHaveBeenCalled()
    expect(onUseNew).toHaveBeenCalled()
  })

  it('SkipCard calls onUnskip when clicked', () => {
    const onUnskip = vi.fn()
    render(<SkipCard path="intent.non_goals" onUnskip={onUnskip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unskip' }))
    expect(onUnskip).toHaveBeenCalled()
  })

  it('UnknownCard shows the reason', () => {
    render(<UnknownCard reason="pending stakeholder review" path="constraints.compliance" />)
    expect(screen.getByText('pending stakeholder review')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('TerminalTurnCard renders the turn-cap message', () => {
    render(<TerminalTurnCard kind="turn_cap_reached" limit={60} used={60} />)
    expect(screen.getByText(/talked through this for a while/)).toBeInTheDocument()
    expect(screen.getByText('Used 60 of 60.')).toBeInTheDocument()
  })
})

describe('banners', () => {
  afterEach(cleanup)

  it('LockBanner hides when no one holds the lock', () => {
    const { container } = render(
      <LockBanner
        lockState={{
          spec_id: 'x',
          locked_by: null,
          lock_expires_at: null,
          held_by_caller: false,
          holder: null,
        }}
        currentUserId="u-1"
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('LockBanner hides when caller holds the lock', () => {
    const { container } = render(
      <LockBanner
        lockState={{
          spec_id: 'x',
          locked_by: 'u-1',
          lock_expires_at: null,
          held_by_caller: true,
          holder: { id: 'u-1', name: 'Me' },
        }}
        currentUserId="u-1"
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('LockBanner renders when someone else holds the lock', () => {
    render(
      <LockBanner
        lockState={{
          spec_id: 'x',
          locked_by: 'u-2',
          lock_expires_at: new Date(Date.now() + 60_000).toISOString(),
          held_by_caller: false,
          holder: { id: 'u-2', name: 'Bob' },
        }}
        currentUserId="u-1"
      />,
    )
    expect(screen.getByText(/Locked by Bob/)).toBeInTheDocument()
  })

  it('AccessBanner hides for owner, renders for viewer/editor', () => {
    const { container, rerender } = render(
      <AccessBanner access="owner" ownerDisplay="alice" />,
    )
    expect(container.innerHTML).toBe('')
    rerender(<AccessBanner access="viewer" ownerDisplay="alice" />)
    expect(screen.getByText(/Shared with you by alice — read-only/)).toBeInTheDocument()
    cleanup()
    render(<AccessBanner access="editor" ownerDisplay="alice" />)
    expect(screen.getByText(/Shared with you by alice\./)).toBeInTheDocument()
  })
})

describe('ExportJsonButton', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('creates a Blob URL with the spec JSON when clicked', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:test')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL

    const spec = {
      id: '11111111-1111-4111-8111-111111111111',
      owner_id: '22222222-2222-4222-8222-222222222222',
      title: 'Spec',
      status: 'draft' as const,
      schema_version: '0.1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      locked_by: null,
      lock_expires_at: null,
      spec: {
        schema_version: '0.1' as const,
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Spec',
        status: 'draft' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        intent: {},
        domain_model: { entities: [], relationships: [] },
        capabilities: [],
        flows: [],
        constraints: {},
        references: [],
        provenance: { authors: [{ id: 'u' }], unresolved_questions: [] },
        extensions: {},
      },
    }
    render(<ExportJsonButton spec={spec} />)
    fireEvent.click(screen.getByRole('button', { name: /Export spec as JSON/ }))
    expect(createObjectURL).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0]![0] as Blob
    expect(blob.type).toBe('application/json')
    expect(blob.size).toBeGreaterThan(0)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
